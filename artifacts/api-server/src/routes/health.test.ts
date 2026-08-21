import { describe, expect, it } from "vitest";
import { postgresReadiness, workerReadiness } from "./health.js";

describe("health readiness", () => {
  it("returns ok when PostgreSQL responds", async () => {
    await expect(postgresReadiness(async () => undefined)).resolves.toEqual({ status: "ok", dependencies: { postgres: "ok" } });
  });
  it("returns ok when PostgreSQL and Redis respond", async () => {
    await expect(workerReadiness(async () => undefined, async () => undefined)).resolves.toEqual({ status: "ok", dependencies: { postgres: "ok", redis: "ok" } });
  });
  it("returns unavailable when Redis is down without exposing connection details", async () => {
    const result = await workerReadiness(async () => undefined, async () => { throw new Error("redis://user:password@host:6379"); });
    expect(result).toEqual({ status: "unavailable", dependencies: { postgres: "ok", redis: "unavailable" } });
    expect(JSON.stringify(result)).not.toContain("password");
    expect(JSON.stringify(result)).not.toContain("redis://");
  });
  it("returns unavailable without exposing connection details", async () => {
    const result = await postgresReadiness(async () => { throw new Error("postgresql://user:password@host/db"); });
    expect(result).toEqual({ status: "unavailable", dependencies: { postgres: "unavailable" } });
    expect(JSON.stringify(result)).not.toContain("password");
    expect(JSON.stringify(result)).not.toContain("postgresql://");
  });
});
