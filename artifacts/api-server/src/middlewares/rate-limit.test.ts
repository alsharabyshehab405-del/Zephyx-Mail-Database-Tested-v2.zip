import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createAuthRateLimit } from "./rate-limit.js";

describe("auth rate-limit production defaults", () => {
  const previousMax = process.env.AUTH_RATE_LIMIT_MAX;
  const previousWindow = process.env.AUTH_RATE_LIMIT_WINDOW_MS;

  afterEach(() => {
    if (previousMax === undefined) delete process.env.AUTH_RATE_LIMIT_MAX;
    else process.env.AUTH_RATE_LIMIT_MAX = previousMax;
    if (previousWindow === undefined) delete process.env.AUTH_RATE_LIMIT_WINDOW_MS;
    else process.env.AUTH_RATE_LIMIT_WINDOW_MS = previousWindow;
  });

  it("keeps the production fallback at 20 requests when no override is configured", async () => {
    delete process.env.AUTH_RATE_LIMIT_MAX;
    delete process.env.AUTH_RATE_LIMIT_WINDOW_MS;

    const app = express();
    app.set("trust proxy", 1);
    app.use(createAuthRateLimit({ windowMs: 60_000 }));
    app.get("/protected", (_req, res) => res.status(200).json({ ok: true }));

    const responses = [];
    for (let index = 0; index < 21; index += 1) {
      responses.push(await request(app).get("/protected").set("X-Forwarded-For", "198.51.100.42"));
    }

    expect(responses.slice(0, 20).every((response) => response.status === 200)).toBe(true);
    expect(responses[20].status).toBe(429);
    expect(responses[20].headers["ratelimit-limit"]).toBe("20");
    expect(responses[20].body).toEqual({ error: "Too many requests, please try again later." });
  });
});
