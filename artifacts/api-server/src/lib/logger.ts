import pino from "pino";

export const logger = pino({
  level: process.env["LOG_LEVEL"] ?? "info",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers.set-cookie",
      "password",
      "currentPassword",
      "newPassword",
      "refreshToken",
      "accessToken",
      "token",
      "err.config.headers.Authorization",
      "err.config.headers.authorization",
      "err.config.headers.Cookie",
      "err.config.headers.cookie",
      "err.config.params",
    ],
    censor: "[REDACTED]",
  },
  ...(process.env["NODE_ENV"] !== "production"
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            ignore: "pid,hostname",
          },
        },
      }
    : {}),
});
