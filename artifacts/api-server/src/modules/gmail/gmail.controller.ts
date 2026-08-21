import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import { OAuth2Client } from "google-auth-library";
import { createAuthRateLimit } from "../../middlewares/rate-limit.js";
import { requireAuth, type AuthenticatedRequest } from "../../middlewares/auth.js";
import { logger } from "../../lib/logger.js";
import {
  completeGmailConnection,
  createGmailAuthorizationUrl,
  disconnectGmail,
  getGmailStatus,
  listGmailConnections,
  syncGmail,
  syncGmailFromPushNotification,
} from "./gmail.service.js";

const gmailActionRateLimit = createAuthRateLimit({
  max: 10,
  windowMs: 10 * 60 * 1000,
});

const pubSubOidcClient = new OAuth2Client();

function getPubSubBearerToken(req: Request): string | null {
  const authorization = req.get("authorization");

  if (!authorization) {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function verifyPubSubOidcRequest(req: Request): Promise<boolean> {
  const bearerToken = getPubSubBearerToken(req);

  if (!bearerToken) {
    return false;
  }

  const audience = process.env["GMAIL_PUBSUB_OIDC_AUDIENCE"]?.trim();
  const expectedEmail =
    process.env["GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL"]?.trim();

  if (!audience || !expectedEmail) {
    logger.warn(
      "Gmail Pub/Sub OIDC request received before OIDC configuration was completed",
    );
    return false;
  }

  try {
    const ticket = await pubSubOidcClient.verifyIdToken({
      idToken: bearerToken,
      audience,
    });

    const payload = ticket.getPayload();

    if (!payload) {
      return false;
    }

    const issuerIsGoogle =
      payload.iss === "accounts.google.com" ||
      payload.iss === "https://accounts.google.com";

    return (
      issuerIsGoogle &&
      payload.email === expectedEmail &&
      payload.email_verified === true
    );
  } catch (error) {
    const candidate = error as Error;

    logger.warn(
      {
        errorName: candidate.name,
      },
      "Rejected invalid Gmail Pub/Sub OIDC token",
    );

    return false;
  }
}

async function authorizePubSubRequest(req: Request): Promise<boolean> {
  // Google Pub/Sub push requests must use a valid Google-signed OIDC token.
  return verifyPubSubOidcRequest(req);
}

function sendError(res: Response, error: unknown): void {
  const candidate = error as Error & { statusCode?: number };
  const statusCode = candidate.statusCode ?? 500;

  if (statusCode >= 500) {
    logger.error({ err: candidate }, "Gmail integration request failed");
  }

  res.status(statusCode).json({
    error: statusCode >= 500 ? "Gmail integration is temporarily unavailable" : candidate.message,
  });
}

function requestOrigin(req: Request): string {
  const configured = process.env["NOVAMAIL_WEB_URL"]?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const allowedOrigin = (process.env["ALLOWED_ORIGINS"] ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .find((origin) => origin && origin !== "*");
  if (allowedOrigin) return allowedOrigin.replace(/\/+$/, "");

  const redirectUri = process.env["GOOGLE_REDIRECT_URI"]?.trim();
  if (redirectUri) {
    try {
      return new URL(redirectUri).origin;
    } catch {
      // The connect endpoint will report the invalid configuration explicitly.
    }
  }

  if (process.env["NODE_ENV"] !== "production") {
    return `${req.protocol}://${req.get("host")}`;
  }

  throw Object.assign(new Error("NOVAMAIL_WEB_URL must be configured"), {
    statusCode: 503,
  });
}

function callbackRedirect(req: Request, result: "connected" | "error", reason?: string): string {
  const url = new URL("/settings", requestOrigin(req));
  url.searchParams.set("gmail", result);
  if (reason) url.searchParams.set("reason", reason);
  return url.toString();
}

function callbackErrorReason(error: unknown): string {
  const candidate = error as Error & { statusCode?: number };
  if (candidate.statusCode === 400) return "invalid_state";
  if (candidate.statusCode === 503) return "migration_required";
  return "connection_failed";
}

export async function gmailOAuthCallback(req: Request, res: Response): Promise<void> {
  const oauthError = typeof req.query["error"] === "string" ? req.query["error"] : null;
  const code = typeof req.query["code"] === "string" ? req.query["code"] : null;
  const state = typeof req.query["state"] === "string" ? req.query["state"] : null;

  if (oauthError) {
    res.redirect(303, callbackRedirect(req, "error", "access_denied"));
    return;
  }

  if (!code || !state) {
    res.redirect(303, callbackRedirect(req, "error", "missing_callback_data"));
    return;
  }

  try {
    await completeGmailConnection(code, state);
    res.redirect(303, callbackRedirect(req, "connected"));
  } catch (error) {
    const candidate = error as Error & { statusCode?: number };
    logger.warn(
      {
        statusCode: candidate.statusCode ?? 500,
        errorName: candidate.name,
      },
      "Gmail OAuth callback failed",
    );
    res.redirect(303, callbackRedirect(req, "error", callbackErrorReason(error)));
  }
}

export function gmailRouter(): Router {
  const router = createRouter();


  // NOVAMAIL_GMAIL_PUBSUB_ROUTE_START
  router.post("/push", async (req, res) => {
    if (!(await authorizePubSubRequest(req))) {
      res.status(401).json({ error: "Unauthorized Pub/Sub request" });
      return;
    }

    const encodedData =
      typeof req.body?.message?.data === "string"
        ? req.body.message.data
        : "";

    if (!encodedData) {
      res.status(204).end();
      return;
    }

    let notification: {
      emailAddress?: unknown;
      historyId?: unknown;
    };

    try {
      notification = JSON.parse(
        Buffer.from(encodedData, "base64").toString("utf8"),
      ) as {
        emailAddress?: unknown;
        historyId?: unknown;
      };
    } catch {
      // الإشعار غير صالح؛ نقرّه حتى لا يستمر Pub/Sub في إعادته.
      res.status(204).end();
      return;
    }

    if (typeof notification.emailAddress !== "string") {
      res.status(204).end();
      return;
    }

    try {
      await syncGmailFromPushNotification(notification.emailAddress);
      res.status(204).end();
    } catch (error) {
      sendError(res, error);
    }
  });
  // NOVAMAIL_GMAIL_PUBSUB_ROUTE_END

  router.get("/accounts", requireAuth, async (req, res) => {
    const user = (req as AuthenticatedRequest).user;
    try {
      res.json({ accounts: await listGmailConnections(user.sub) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/status", requireAuth, async (req, res) => {
    const user = (req as AuthenticatedRequest).user;
    const accountId = typeof req.query.accountId === "string" ? req.query.accountId : undefined;
    try {
      res.json(await getGmailStatus(user.sub, accountId));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/connect", gmailActionRateLimit, requireAuth, async (req, res) => {
    const user = (req as AuthenticatedRequest).user;
    try {
      res.json({ url: createGmailAuthorizationUrl(user.sub) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/sync", gmailActionRateLimit, requireAuth, async (req, res) => {
    const user = (req as AuthenticatedRequest).user;
    const accountId = typeof req.body?.accountId === "string" ? req.body.accountId : undefined;
    try {
      res.json(await syncGmail(user.sub, accountId));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.delete("/connection", gmailActionRateLimit, requireAuth, async (req, res) => {
    const user = (req as AuthenticatedRequest).user;
    const accountId = typeof req.query.accountId === "string" ? req.query.accountId : undefined;
    try {
      await disconnectGmail(user.sub, accountId);
      res.status(204).end();
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}
