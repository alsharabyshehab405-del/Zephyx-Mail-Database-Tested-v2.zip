import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/health/live", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

router.get("/health/ready", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.status(200).json({ status: "ok", dependencies: { postgres: "ok" } });
  } catch {
    res.status(503).json({ status: "unavailable", dependencies: { postgres: "unavailable" } });
  }
});

router.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

export default router;
