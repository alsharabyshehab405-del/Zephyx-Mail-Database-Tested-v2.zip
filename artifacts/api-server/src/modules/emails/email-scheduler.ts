import { logger } from "../../lib/logger.js";

/**
 * Compatibility shim for the pre-v4 scheduler API. Scheduled delivery now runs
 * only in the dedicated scheduler and worker processes; API replicas never start
 * an in-process timer.
 */
export function startEmailScheduler(): () => void {
  logger.info("Legacy in-process email scheduler is disabled; use the dedicated scheduler process");
  return stopEmailScheduler;
}
export function stopEmailScheduler(): void {
  // Intentionally empty: the dedicated scheduler owns the timer and shutdown.
}
