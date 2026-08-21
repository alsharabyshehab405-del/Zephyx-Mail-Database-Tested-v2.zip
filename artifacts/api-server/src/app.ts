import { existsSync } from "node:fs";
import path from "node:path";
import express, { type Request } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { pinoHttp } from "pino-http";
import { logger } from "./lib/logger.js";
import { registerRoutes } from "./routes/index.js";
import { sanitizeEmailHtmlPayload } from "./lib/sanitize-email-html.js";
import { auditSensitiveRequests } from "./middlewares/audit-sensitive.js";

const app = express();

// Replit and production deployments sit behind one trusted reverse proxy.
app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false, // The API may also serve the prebuilt SPA on single-process hosts.
    crossOriginEmbedderPolicy: false,
  }),
);
app.disable("x-powered-by");

app.use(
  pinoHttp({
    logger,
    // OAuth callback query parameters contain a one-time authorization code and
    // signed state. Do not include that URL in automatic access logs.
    autoLogging: {
      ignore: (req) => {
        const path = (req.url ?? "").split("?")[0];

        return (
          path === "/api/auth/google/callback" ||
          path === "/api/gmail/push"
        );
      },
    },
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "res.headers.set-cookie",
        "req.body.password",
        "req.body.currentPassword",
        "req.body.newPassword",
        "req.body.refreshToken",
        "req.body.token",
      ],
      censor: "[REDACTED]",
    },
  }),
);

app.use(auditSensitiveRequests);

const configuredOrigins = (process.env["ALLOWED_ORIGINS"] ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const developmentAllowsAnyOrigin =
  process.env["NODE_ENV"] !== "production" &&
  (configuredOrigins.length === 0 || configuredOrigins.includes("*"));

app.use(
  cors({
    origin(origin, callback) {
      // Requests without Origin are from native clients, server-to-server calls,
      // health checks, or command-line tools.
      if (!origin || developmentAllowsAnyOrigin || configuredOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  }),
);


// Security hardening for HTML responses and attachment uploads.
const blockedAttachmentExtensions = new Set([
  ".html", ".htm", ".xhtml",
  ".svg",
  ".js", ".mjs", ".cjs",
  ".exe", ".dll", ".com", ".scr",
  ".bat", ".cmd", ".ps1", ".sh",
  ".php", ".phtml",
  ".jar", ".msi",
]);

const blockedAttachmentMimeTypes = new Set([
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
  "application/javascript",
  "text/javascript",
  "application/x-javascript",
]);

app.use((req, res, next) => {
  if (req.method === "POST" && req.path === "/api/emails/attachments") {
    let filename = req.get("x-file-name") ?? "";

    try {
      filename = decodeURIComponent(filename);
    } catch {
      // Keep original value if malformed percent encoding was supplied.
    }

    const normalizedFilename = filename.trim().toLowerCase();
    const dotIndex = normalizedFilename.lastIndexOf(".");
    const extension =
      dotIndex >= 0 ? normalizedFilename.slice(dotIndex) : "";

    const mimeType = (req.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();

    if (
      blockedAttachmentExtensions.has(extension) ||
      blockedAttachmentMimeTypes.has(mimeType)
    ) {
      return res.status(415).json({
        error: "Unsupported attachment type",
      });
    }
  }

  return next();
});

// Sanitize email HTML before it reaches any frontend dangerouslySetInnerHTML sink.
app.use((_req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = ((body: unknown) => {
    return originalJson(sanitizeEmailHtmlPayload(body));
  }) as typeof res.json;

  next();
});

const jsonParser = express.json({ limit: "10mb" });
const urlencodedParser = express.urlencoded({ extended: true });

function isAttachmentUpload(req: Request): boolean {
  return req.method === "POST" && req.path === "/api/emails/attachments";
}

app.use((req, res, next) => {
  // Attachment uploads are raw bytes. Skipping the JSON parser here also
  // allows users to attach .json files without Express consuming the body.
  if (isAttachmentUpload(req)) {
    next();
    return;
  }

  jsonParser(req, res, next);
});
app.use((req, res, next) => {
  if (isAttachmentUpload(req)) {
    next();
    return;
  }

  urlencodedParser(req, res, next);
});
app.use(cookieParser());

app.get("/api/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

registerRoutes(app);


const webDistDirectory =
  process.env.NODE_ENV === "production"
    ? [
        path.resolve(process.cwd(), "../novamail-web/dist/public"),
        path.resolve(process.cwd(), "artifacts/novamail-web/dist/public"),
      ].find((candidate) => existsSync(candidate))
    : undefined;

if (webDistDirectory) {
  app.use(express.static(webDistDirectory, { index: false }));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) {
      next();
      return;
    }

    res.sendFile(path.join(webDistDirectory, "index.html"));
  });
}

app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

export default app;
