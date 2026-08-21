const base = process.env.STAGING_BASE_URL ?? "http://127.0.0.1:3500";
const endpoints = ["/api/health/live", "/api/health/ready", "/api/healthz"];
for (const endpoint of endpoints) {
  const response = await fetch(new URL(endpoint, base));
  if (!response.ok) throw new Error(`${endpoint} returned ${response.status}`);
  const body = await response.json();
  if (!body || typeof body !== "object") throw new Error(`${endpoint} returned invalid JSON`);
  console.log(`${endpoint} ${response.status}`);
}
console.log("staging smoke passed");
