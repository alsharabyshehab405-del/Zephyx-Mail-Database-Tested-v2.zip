import app from "./app.js";
import { pool } from "@workspace/db";
import { logger } from "./lib/logger.js";
import { validateProductionSecrets } from "./lib/production-config.js";
import { loadSmtpTimeouts, validateTimeoutRelationship } from "./lib/runtime-timeouts.js";

validateProductionSecrets();
validateTimeoutRelationship(loadSmtpTimeouts(), Number(process.env.JOB_TIMEOUT_MS ?? 120_000));

const rawPort = process.env.PORT ?? "3000";
const port = Number(rawPort);
if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error(`Invalid PORT value: "${rawPort}"`);

const server = app.listen(port, "0.0.0.0", (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});

let shuttingDown = false;
async function gracefulShutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Graceful shutdown started");
  const forceExit = setTimeout(() => {
    logger.error("Graceful shutdown timed out");
    process.exit(1);
  }, 10_000);
  forceExit.unref();
  server.close(async (error) => {
    if (error) logger.error({ err: error }, "HTTP server close failed");
    try {
      await pool.end();
      clearTimeout(forceExit);
      process.exit(error ? 1 : 0);
    } catch (poolError) {
      logger.error({ err: poolError }, "Database pool close failed");
      process.exit(1);
    }
  });
}

process.once("SIGTERM", () => void gracefulShutdown("SIGTERM"));
process.once("SIGINT", () => void gracefulShutdown("SIGINT"));
