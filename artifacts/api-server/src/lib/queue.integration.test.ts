import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { afterEach, describe, expect, it } from "vitest";

const redisUrl = process.env.REDIS_URL;
const prefix = process.env.QUEUE_PREFIX ?? "zephyx-test";
const resources: Array<{ queue: Queue; worker: Worker; connections: IORedis[] }> = [];

afterEach(async () => {
  for (const resource of resources.splice(0)) {
    await resource.worker.close();
    await resource.queue.obliterate({ force: true }).catch(() => undefined);
    await resource.queue.close();
    await Promise.all(resource.connections.map((connection) => connection.quit()));
  }
});

describe("Redis Queue integration", () => {
  it("processes one deterministic job once when two producers enqueue the same logical operation", async () => {
    if (!redisUrl) throw new Error("REDIS_URL is required for Redis Queue integration tests");
    const name = `queue-test-${Date.now()}`;
    const producerConnection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    const workerConnection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    const queue = new Queue(name, { connection: producerConnection, prefix, defaultJobOptions: { attempts: 3, removeOnComplete: true } });
    const processed: string[] = [];
    const worker = new Worker(name, async (job) => {
      processed.push(job.id ?? "unknown");
      return { ok: true };
    }, { connection: workerConnection, prefix, concurrency: 2 });
    resources.push({ queue, worker, connections: [producerConnection, workerConnection] });
    await worker.waitUntilReady();
    const first = await queue.add("email-send", { emailId: "email-1", correlationId: "corr-1" }, { jobId: "email:email-1" });
    const second = await queue.add("email-send", { emailId: "email-1", correlationId: "corr-1" }, { jobId: "email:email-1" });
    expect(first.id).toBe(second.id);
    for (let attempt = 0; attempt < 50 && processed.length === 0; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 20));
    expect(processed).toEqual([first.id]);
  });
});
