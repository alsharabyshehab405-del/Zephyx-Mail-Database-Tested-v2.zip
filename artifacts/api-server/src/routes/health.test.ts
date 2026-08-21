import { describe, expect, it } from "vitest";
import { postgresReadiness } from "./health.js";

describe("health readiness", () => {
  it("returns ok when PostgreSQL responds", async () => {
    await expect(postgresReadiness(async () => undefined)).resolves.toEqual({ status: "ok", dependencies: { postgres: "ok" } });
  });
  it("returns unavailable without exposing connection details", async () => {
    const result = await postgresReadiness(async () => { throw new Error("postgresql://user:password@host/db"); });
    expect(result).toEqual({ status: "unavailable", dependencies: { postgres: "unavailable" } });
    expect(JSON.stringify(result)).not.toContain("password");
    expect(JSON.stringify(result)).not.toContain("postgresql://");
  });
});
