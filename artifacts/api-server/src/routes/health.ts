import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";

const router: IRouter = Router();

export async function postgresReadiness(query: () => Promise<unknown>): Promise<{ status: "ok" | "unavailable"; dependencies: { postgres: "ok" | "unavailable" } }> {
  try {
    await query();
    return { status: "ok", dependencies: { postgres: "ok" } };
  } catch {
    return { status: "unavailable", dependencies: { postgres: "unavailable" } };
  }
}

router.get("/health/live", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

router.get("/health/ready", async (_req, res) => {
  const result = await postgresReadiness(() => pool.query("SELECT 1"));
  res.status(result.status === "ok" ? 200 : 503).json(result);
});

router.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

export default router;
