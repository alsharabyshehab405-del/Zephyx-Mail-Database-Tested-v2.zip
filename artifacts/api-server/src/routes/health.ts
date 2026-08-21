import { Router, type IRouter } from "express";
import IORedis from "ioredis";
import { pool } from "@workspace/db";
import { requireAdmin } from "../middlewares/auth.js";

const router: IRouter = Router();
type DependencyStatus = "ok" | "unavailable";

export async function postgresReadiness(query: () => Promise<unknown>): Promise<{ status: DependencyStatus; dependencies: { postgres: DependencyStatus } }> {
  try {
    await query();
    return { status: "ok", dependencies: { postgres: "ok" } };
  } catch {
    return { status: "unavailable", dependencies: { postgres: "unavailable" } };
  }
}

export async function workerReadiness(
  postgresQuery: () => Promise<unknown>,
  redisQuery: () => Promise<unknown>,
): Promise<{ status: DependencyStatus; dependencies: { postgres: DependencyStatus; redis: DependencyStatus } }> {
  const postgres = await postgresReadiness(postgresQuery);
  let redis: DependencyStatus = "ok";
  try {
    await redisQuery();
  } catch {
    redis = "unavailable";
  }
  const status = postgres.status === "ok" && redis === "ok" ? "ok" : "unavailable";
  return { status, dependencies: { postgres: postgres.dependencies.postgres, redis } };
}

async function redisReadiness(): Promise<DependencyStatus> {
  const url = process.env.REDIS_URL;
  if (!url) return "unavailable";
  const redis = new IORedis(url, { maxRetriesPerRequest: 1, connectTimeout: 1000 });
  try {
    return (await redis.ping()) === "PONG" ? "ok" : "unavailable";
  } catch {
    return "unavailable";
  } finally {
    await redis.quit().catch(() => undefined);
  }
}

router.get("/health/live", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

router.get("/health/ready", async (_req, res) => {
  const result = await postgresReadiness(() => pool.query("SELECT 1"));
  res.status(result.status === "ok" ? 200 : 503).json(result);
});

router.get("/health/worker/ready", async (_req, res) => {
  const result = await workerReadiness(() => pool.query("SELECT 1"), async () => {
    const status = await redisReadiness();
    if (status !== "ok") throw new Error("Redis unavailable");
  });
  res.status(result.status === "ok" ? 200 : 503).json(result);
});

router.get("/metrics", requireAdmin, async (_req, res) => {
  const rows = await pool.query<{ status: string; count: string; attempts: string; duration: string; lag: string }>("SELECT status::text, count(*)::text AS count, coalesce(sum(attempts), 0)::text AS attempts, coalesce(avg(duration_ms), 0)::text AS duration, count(*) FILTER (WHERE status = 'pending' AND available_at < now())::text AS lag FROM email_dispatch_outbox GROUP BY status");
  const redis = await redisReadiness();
  const lines = [
    "# HELP zephyx_worker_redis_up Redis connectivity for queue workers.",
    "# TYPE zephyx_worker_redis_up gauge",
    `zephyx_worker_redis_up ${redis === "ok" ? 1 : 0}`,
    "# HELP zephyx_outbox_jobs Number of durable outbox jobs by status.",
    "# TYPE zephyx_outbox_jobs gauge",
    "# HELP zephyx_outbox_retries Total attempts by Outbox status.",
    "# TYPE zephyx_outbox_retries gauge",
    "# HELP zephyx_outbox_job_duration_ms Average completed job duration in milliseconds.",
    "# TYPE zephyx_outbox_job_duration_ms gauge",
    "# HELP zephyx_outbox_queue_lag Number of due pending jobs.",
    "# TYPE zephyx_outbox_queue_lag gauge",
    ...rows.rows.flatMap((row) => {
      const status = row.status.replace(/[^a-z_]/g, "");
      return [
        `zephyx_outbox_jobs{status=\"${status}\"} ${row.count}`,
        `zephyx_outbox_retries{status=\"${status}\"} ${row.attempts}`,
        `zephyx_outbox_job_duration_ms{status=\"${status}\"} ${row.duration}`,
        `zephyx_outbox_queue_lag{status=\"${status}\"} ${row.lag}`,
      ];
    }),
  ];
  res.type("text/plain; version=0.0.4").send(`${lines.join("\n")}\n`);
});

router.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

export default router;
