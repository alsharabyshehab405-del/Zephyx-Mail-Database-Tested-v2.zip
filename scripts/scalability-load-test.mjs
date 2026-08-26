#!/usr/bin/env node

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index];
  if (!value?.startsWith("--")) continue;
  const [key, inline] = value.slice(2).split("=", 2);
  const next = inline ?? process.argv[index + 1];
  if (inline === undefined && next && !next.startsWith("--")) index += 1;
  args.set(key, next ?? "true");
}

function intArg(name, fallback, min, max) {
  const value = Number.parseInt(args.get(name) ?? String(fallback), 10);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`--${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

const base = String(args.get("base") ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const parsedBase = new URL(base);
if (!["127.0.0.1", "localhost", "::1"].includes(parsedBase.hostname)) {
  throw new Error("Refusing to run load traffic against a non-local host; use synthetic capacity planning for remote environments.");
}

const requests = intArg("requests", 500, 1, 50_000);
const concurrency = intArg("concurrency", 25, 1, 200);
const virtualUsers = intArg("virtual-users", 10_000, 1, 1_000_000);
const path = String(args.get("path") ?? "/api/healthz");
const target = new URL(path, `${base}/`).toString();
const durations = [];
let completed = 0;
let failed = 0;
let next = 0;

async function one() {
  const started = performance.now();
  try {
    const response = await fetch(target, { headers: { "x-load-test": "synthetic-local-only" } });
    if (!response.ok) failed += 1;
    else await response.arrayBuffer();
  } catch {
    failed += 1;
  } finally {
    durations.push(performance.now() - started);
    completed += 1;
  }
}

async function worker() {
  while (true) {
    const index = next;
    next += 1;
    if (index >= requests) return;
    await one();
  }
}

const batchStarted = performance.now();
await Promise.all(Array.from({ length: Math.min(concurrency, requests) }, worker));
const elapsedMs = performance.now() - batchStarted;
durations.sort((a, b) => a - b);
const percentile = (fraction) => durations[Math.min(durations.length - 1, Math.floor(durations.length * fraction))] ?? 0;
const result = {
  mode: "synthetic-local-load",
  target,
  virtualUsers,
  requests,
  concurrency: Math.min(concurrency, requests),
  completed,
  failed,
  elapsedMs: Number(elapsedMs.toFixed(2)),
  p50Ms: Number(percentile(0.5).toFixed(2)),
  p95Ms: Number(percentile(0.95).toFixed(2)),
  p99Ms: Number(percentile(0.99).toFixed(2)),
  note: "Virtual-user values are capacity-planning labels; this bounded run is not proof of real 10k/100k/1M-user capacity.",
};
console.log(JSON.stringify(result, null, 2));
if (failed > 0) process.exitCode = 1;
