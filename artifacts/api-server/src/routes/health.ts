import { Router, type IRouter } from "express";
import IORedis from "ioredis";
import { pool } from "@workspace/db";
import { requireAdmin } from "../middlewares/auth.js";
import { observabilityPrometheus } from "../lib/observability.js";

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

// This API endpoint checks dependencies required by the dedicated Worker; it does not claim that the Worker process itself is alive.
router.get("/health/worker/ready", async (_req, res) => {
  const result = await workerReadiness(() => pool.query("SELECT 1"), async () => {
    const status = await redisReadiness();
    if (status !== "ok") throw new Error("Redis unavailable");
  });
  res.status(result.status === "ok" ? 200 : 503).json(result);
});

router.get("/metrics", requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query<{ pending: string; queueLagSeconds: string; staleProcessing: string; deadLetter: string; deliveryUnknown: string; attempts: string; duration: string }>(`
      SELECT
        count(*) FILTER (WHERE status IN ('pending', 'publishing'))::text AS pending,
        coalesce(max(EXTRACT(EPOCH FROM (now() - available_at))) FILTER (WHERE status = 'pending' AND available_at < now()), 0)::text AS "queueLagSeconds",
        count(*) FILTER (WHERE status = 'processing' AND lease_expires_at < now())::text AS "staleProcessing",
        count(*) FILTER (WHERE status = 'dead_letter')::text AS "deadLetter",
        count(*) FILTER (WHERE status = 'delivery_unknown')::text AS "deliveryUnknown",
        coalesce(sum(attempts), 0)::text AS attempts,
        coalesce(avg(duration_ms) FILTER (WHERE status = 'completed'), 0)::text AS duration
      FROM email_dispatch_outbox
    `);
    const row = result.rows[0] ?? { pending: "0", queueLagSeconds: "0", staleProcessing: "0", deadLetter: "0", deliveryUnknown: "0", attempts: "0", duration: "0" };
    const redis = await redisReadiness();
    const lines = [
      "# HELP zephyx_postgres_pool_total_connections Total PostgreSQL pool connections.",
      "# TYPE zephyx_postgres_pool_total_connections gauge",
      `zephyx_postgres_pool_total_connections ${pool.totalCount}`,
      "# HELP zephyx_postgres_pool_idle_connections Idle PostgreSQL pool connections.",
      "# TYPE zephyx_postgres_pool_idle_connections gauge",
      `zephyx_postgres_pool_idle_connections ${pool.idleCount}`,
      "# HELP zephyx_postgres_pool_waiting_requests Requests waiting for a PostgreSQL pool connection.",
      "# TYPE zephyx_postgres_pool_waiting_requests gauge",
      `zephyx_postgres_pool_waiting_requests ${pool.waitingCount}`,
      "# HELP zephyx_worker_redis_up Redis connectivity for queue workers.",
      "# TYPE zephyx_worker_redis_up gauge",
      `zephyx_worker_redis_up ${redis === "ok" ? 1 : 0}`,
      "# HELP zephyx_outbox_pending_jobs Pending or publishing jobs.",
      "# TYPE zephyx_outbox_pending_jobs gauge",
      `zephyx_outbox_pending_jobs ${row.pending}`,
      "# HELP zephyx_outbox_queue_lag_seconds Age in seconds of the oldest due pending job.",
      "# TYPE zephyx_outbox_queue_lag_seconds gauge",
      `zephyx_outbox_queue_lag_seconds ${row.queueLagSeconds}`,
      "# HELP zephyx_outbox_stale_processing_jobs Processing jobs whose lease expired.",
      "# TYPE zephyx_outbox_stale_processing_jobs gauge",
      `zephyx_outbox_stale_processing_jobs ${row.staleProcessing}`,
      "# HELP zephyx_outbox_dead_letter_jobs Dead-lettered jobs.",
      "# TYPE zephyx_outbox_dead_letter_jobs gauge",
      `zephyx_outbox_dead_letter_jobs ${row.deadLetter}`,
      "# HELP zephyx_outbox_delivery_unknown_jobs Jobs requiring manual reconciliation.",
      "# TYPE zephyx_outbox_delivery_unknown_jobs gauge",
      `zephyx_outbox_delivery_unknown_jobs ${row.deliveryUnknown}`,
      "# HELP zephyx_outbox_retries Total attempts.",
      "# TYPE zephyx_outbox_retries gauge",
      `zephyx_outbox_retries ${row.attempts}`,
      "# HELP zephyx_outbox_job_duration_ms Average completed duration.",
      "# TYPE zephyx_outbox_job_duration_ms gauge",
      `zephyx_outbox_job_duration_ms ${row.duration}`,
    ];
    res.type("text/plain; version=0.0.4").send(`${lines.join("\n")}\n${observabilityPrometheus()}`);
  } catch {
    res.status(503).json({ error: "Metrics unavailable" });
  }
});

router.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

export default router;
