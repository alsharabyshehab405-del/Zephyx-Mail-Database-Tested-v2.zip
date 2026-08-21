const base = process.env.LOAD_TEST_BASE_URL ?? "http://127.0.0.1:3500";
const requests = Math.max(1, Math.min(Number(process.env.LOAD_TEST_REQUESTS ?? 50), 500));
const path = process.env.LOAD_TEST_PATH ?? "/api/health/live";
const durations = [];
let failures = 0;
for (let index = 0; index < requests; index += 1) {
  const started = performance.now();
  try {
    const response = await fetch(new URL(path, base));
    if (!response.ok) failures += 1;
    await response.arrayBuffer();
  } catch {
    failures += 1;
  }
  durations.push(performance.now() - started);
}
durations.sort((a, b) => a - b);
const p95 = durations[Math.min(durations.length - 1, Math.ceil(durations.length * 0.95) - 1)];
if (failures > 0) throw new Error(`load test had ${failures} failed requests`);
console.log(JSON.stringify({ base, path, requests, failures, p95Ms: Number(p95.toFixed(2)) }));
