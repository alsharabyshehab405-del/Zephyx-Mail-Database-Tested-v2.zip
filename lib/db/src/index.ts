import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

function boundedIntEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: boundedIntEnv("PG_POOL_MAX", 20, 1, 200),
  min: boundedIntEnv("PG_POOL_MIN", 0, 0, 50),
  idleTimeoutMillis: boundedIntEnv("PG_POOL_IDLE_TIMEOUT_MS", 30_000, 1_000, 600_000),
  connectionTimeoutMillis: boundedIntEnv("PG_POOL_CONNECTION_TIMEOUT_MS", 5_000, 100, 60_000),
  maxUses: boundedIntEnv("PG_POOL_MAX_USES", 0, 0, 1_000_000),
});
export const db = drizzle(pool, { schema });

export * from "./schema";
