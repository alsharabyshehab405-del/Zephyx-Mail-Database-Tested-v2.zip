#!/usr/bin/env node
import crypto from "node:crypto";

const base = process.env.STAGING_BASE_URL ?? "http://127.0.0.1:3500";
const runId = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
const password = `StagingOnly-${crypto.randomBytes(18).toString("base64url")}!`;
const users = [
  { email: `staging-alice-${runId}@example.invalid`, firstName: "Staging", lastName: "Alice" },
  { email: `staging-bob-${runId}@example.invalid`, firstName: "Staging", lastName: "Bob" },
];

async function call(path, options = {}) {
  const response = await fetch(new URL(path, base), {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers ?? {}) },
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { response, body };
}

for (const user of users) {
  const { response, body } = await call("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ ...user, password }),
  });
  if (response.status !== 201) throw new Error(`Could not seed ${user.email}: HTTP ${response.status}`);
  console.log(`seeded ${user.email} id=${body?.user?.id ?? "unknown"}`);
}

console.log(`STAGING_SEED_RUN=${runId}`);
console.log("Seed data uses example.invalid addresses and an in-memory password; no Production data was read or written.");
