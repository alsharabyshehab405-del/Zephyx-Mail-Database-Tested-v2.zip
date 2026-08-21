import { describe, expect, it } from "vitest";
import { gracefulShutdownWorker } from "./worker-shutdown.js";

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function dependencies(overrides: Partial<Parameters<typeof gracefulShutdownWorker>[0]> = {}) {
  return {
    stopAcceptingJobs: async () => undefined,
    forceStopJobs: async () => undefined,
    closeRedis: async () => undefined,
    closeOutbox: async () => undefined,
    closeDatabase: async () => undefined,
    ...overrides,
  };
}

describe("bounded Worker graceful shutdown", () => {
  it("waits for an active job that finishes before the shutdown deadline", async () => {
    let completed = false;
    let forced = false;
    const result = await gracefulShutdownWorker(dependencies({
      stopAcceptingJobs: async () => {
        await wait(20);
        completed = true;
      },
      forceStopJobs: async () => { forced = true; },
    }), 1_000);

    expect(result.timedOut).toBe(false);
    expect(completed).toBe(true);
    expect(forced).toBe(false);
  });

  it("returns at the deadline and leaves an unfinished job recoverable", async () => {
    let completed = false;
    let forced = false;
    const result = await gracefulShutdownWorker(dependencies({
      stopAcceptingJobs: () => new Promise<void>(() => undefined),
      forceStopJobs: async () => { forced = true; },
    }), 1_000);

    expect(result.timedOut).toBe(true);
    expect(forced).toBe(true);
    expect(completed).toBe(false);
  });
});
