import pino from "pino";

export const LOGGER_REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "res.headers.set-cookie",
  "req.body",
  "res.body",
  "password",
  "currentPassword",
  "newPassword",
  "refreshToken",
  "accessToken",
  "token",
  "bodyText",
  "bodyHtml",
  "bodyPreview",
  "subject",
  "fromEmail",
  "toEmail",
  "email",
  "message",
  "notification",
  "prompt",
  "context",
  "contentsBase64",
  "attachments",
  "err.config.headers.Authorization",
  "err.config.headers.authorization",
  "err.config.headers.Cookie",
  "err.config.headers.cookie",
  "err.config.params",
] as const;

export const logger = pino({
  level: process.env["LOG_LEVEL"] ?? "info",
  redact: {
    paths: [
      ...LOGGER_REDACT_PATHS,
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
