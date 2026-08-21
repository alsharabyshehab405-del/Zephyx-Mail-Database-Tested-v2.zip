import { describe, expect, it } from "vitest";
import { gracefulShutdownWorker } from "./worker-shutdown.js";

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function dependencies(overrides: Partial<Parameters<typeof gracefulShutdownWorker>[0]> = {}) {
  return {
    pauseNewJobs: async () => undefined,
    waitForActiveJobs: async () => true,
    abortActiveJobs: async () => undefined,
    closeGracefully: async () => undefined,
    closeForcefully: async () => undefined,
    closeRedis: async () => undefined,
    closeOutbox: async () => undefined,
    closeDatabase: async () => undefined,
    ...overrides,
  };
}

describe("bounded Worker graceful shutdown", () => {
  it("pauses intake, waits for a fast active job, and calls graceful close only", async () => {
    const order: string[] = [];
    const result = await gracefulShutdownWorker(dependencies({
      pauseNewJobs: async () => { order.push("pause"); },
      waitForActiveJobs: async () => { order.push("drain"); await wait(20); return true; },
      closeGracefully: async () => { order.push("close-graceful"); },
      closeForcefully: async () => { order.push("close-force"); },
      closeRedis: async () => { order.push("redis"); },
      closeOutbox: async () => { order.push("outbox"); },
      closeDatabase: async () => { order.push("database"); },
    }), 1_000);

    expect(result).toMatchObject({ timedOut: false, mode: "graceful", workerClosed: true, resourcesClosed: true });
    expect(order).toEqual(["pause", "drain", "close-graceful", "redis", "outbox", "database"]);
    expect(order).not.toContain("close-force");
  });

  it("uses force close as the first close call and leaves resources open while a processor remains", async () => {
    const order: string[] = [];
    let completed = false;
    const result = await gracefulShutdownWorker(dependencies({
      pauseNewJobs: async () => { order.push("pause"); },
      waitForActiveJobs: async () => false,
      abortActiveJobs: async () => { order.push("abort"); },
      closeGracefully: async () => { order.push("close-graceful"); },
      closeForcefully: async () => { order.push("close-force"); },
      closeRedis: async () => { order.push("redis"); },
      closeOutbox: async () => { order.push("outbox"); },
      closeDatabase: async () => { order.push("database"); },
      activeJobsRemaining: () => 1,
    }), 1_000);

    expect(result).toMatchObject({ timedOut: true, mode: "force", workerClosed: true, resourcesClosed: false });
    expect(order.slice(0, 3)).toEqual(["pause", "abort", "close-force"]);
    expect(order).not.toContain("close-graceful");
    expect(order).not.toContain("redis");
    expect(order).not.toContain("database");
    expect(completed).toBe(false);
  });
});
