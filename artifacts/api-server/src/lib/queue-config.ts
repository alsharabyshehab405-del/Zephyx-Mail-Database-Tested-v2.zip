import { Queue, type JobsOptions } from "bullmq";
import IORedis from "ioredis";

export const QUEUE_NAMES = {
  emailSend: "email-send",
  emailScheduled: "email-scheduled",
  gmailSync: "gmail-sync",
  gmailWebhook: "gmail-webhook",
  aiProcessing: "ai-processing",
  maintenance: "maintenance",
} as const;
export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

const FALSE_VALUES = new Set(["", "false", "0", "no"]);
function intEnv(name: string, fallback: number, min: number, max: number, env: NodeJS.ProcessEnv): number {
  const value = Number(env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer between ${min} and ${max}`);
  return value;
}
export type QueueRuntimeConfig = {
  redisUrl: string;
  prefix: string;
  concurrency: number;
  maxAttempts: number;
  backoffMs: number;
  jobTimeoutMs: number;
  schedulerEnabled: boolean;
};
export function loadQueueConfig(env: NodeJS.ProcessEnv = process.env): QueueRuntimeConfig {
  const redisUrl = env.REDIS_URL?.trim();
  if (!redisUrl) throw new Error("REDIS_URL is required for Queue/Worker processes");
  if (env.NODE_ENV === "production" && /^redis:\/\/localhost/i.test(redisUrl)) throw new Error("Production REDIS_URL must not point to localhost");
  return {
    redisUrl,
    prefix: env.QUEUE_PREFIX?.trim() || "zephyx",
    concurrency: intEnv("WORKER_CONCURRENCY", 5, 1, 100, env),
    maxAttempts: intEnv("QUEUE_MAX_ATTEMPTS", 5, 1, 20, env),
    backoffMs: intEnv("QUEUE_BACKOFF_MS", 1000, 100, 86_400_000, env),
    jobTimeoutMs: intEnv("JOB_TIMEOUT_MS", 120_000, 1000, 3_600_000, env),
    schedulerEnabled: !FALSE_VALUES.has((env.SCHEDULER_ENABLED ?? "false").trim().toLowerCase()),
  };
}
export function createRedisConnection(config = loadQueueConfig()): IORedis {
  return new IORedis(config.redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: true, lazyConnect: false });
}
export function safeRedisStatus(error?: unknown): { status: "ok" | "unavailable" } {
  return error ? { status: "unavailable" } : { status: "ok" };
}
export function defaultJobOptions(config = loadQueueConfig()): JobsOptions {
  return {
    attempts: config.maxAttempts,
    backoff: { type: "exponential", delay: config.backoffMs, jitter: 0.25 },
    removeOnComplete: { age: 86_400, count: 1000 },
    removeOnFail: false,
  };
}
export function createQueue<T>(name: QueueName, config = loadQueueConfig()): { queue: Queue<T>; connection: IORedis } {
  const connection = createRedisConnection(config);
  return { connection, queue: new Queue<T>(name, { connection, prefix: config.prefix, defaultJobOptions: defaultJobOptions(config) }) };
}
export function queueJobId(prefix: string, logicalKey: string): string { return `${prefix}-${logicalKey}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 240); }
