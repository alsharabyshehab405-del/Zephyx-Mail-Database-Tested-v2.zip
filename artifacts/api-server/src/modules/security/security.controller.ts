import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../../middlewares/auth.js";
import {
  createSecurityReport,
  getThreatAnalysisForUser,
  securityProviderStatus,
  type SecurityReportType,
} from "./threat-protection.service.js";
import {
  getAiPhishingAnalysis,
  requestAiPhishingAnalysis,
} from "./ai-phishing.service.js";
import { getUnifiedSecurityEngine } from "./security-engine.service.js";
import { inspectEmailUrls } from "./url-intelligence.service.js";
import { getSecurityFeedback, submitSecurityFeedback } from "./security-feedback.service.js";
import type { SecurityFeedbackType } from "@workspace/db";
import { db, emailsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

function currentUserId(req: import("express").Request): string {
  return (req as unknown as AuthenticatedRequest).user.sub;
}

function organizationId(req: import("express").Request): string {
  const value = req.header("X-Organization-Id")?.trim();
  return value || "personal";
}

function sendError(res: import("express").Response, error: unknown) {
  const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
  return res.status(statusCode).json({
    error: statusCode >= 500 ? "Internal server error" : (error as Error).message,
  });
}

async function assertOwnedEmail(userId: string, emailId: string): Promise<void> {
  const [email] = await db
    .select({ id: emailsTable.id })
    .from(emailsTable)
    .where(and(eq(emailsTable.id, emailId), eq(emailsTable.userId, userId)))
    .limit(1);
  if (!email) throw Object.assign(new Error("Email not found"), { statusCode: 404 });
}

export function securityRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/settings", (_req, res) => res.json({ providers: securityProviderStatus() }));

  router.get("/emails/:emailId/threat", async (req, res) => {
    try {
      const userId = currentUserId(req);
      const emailId = req.params["emailId"] as string;
      await assertOwnedEmail(userId, emailId);
      return res.json({ analysis: await getThreatAnalysisForUser(userId, emailId) });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.get("/emails/:emailId/ai-phishing", async (req, res) => {
    try {
      return res.json({ analysis: await getAiPhishingAnalysis(currentUserId(req), req.params["emailId"] as string, organizationId(req)) });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post("/emails/:emailId/ai-phishing", async (req, res) => {
    try {
      const locale = typeof req.body?.locale === "string" ? req.body.locale.slice(0, 16) : null;
      const analysis = await requestAiPhishingAnalysis(currentUserId(req), req.params["emailId"] as string, organizationId(req), locale);
      return res.status(200).json({ analysis });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.get("/emails/:emailId/security-engine", async (req, res) => {
    try {
      return res.json(await getUnifiedSecurityEngine(currentUserId(req), req.params["emailId"] as string, organizationId(req)));
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.get("/emails/:emailId/url-intelligence", async (req, res) => {
    try {
      return res.json(await inspectEmailUrls(currentUserId(req), req.params["emailId"] as string));
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.get("/emails/:emailId/security-feedback", async (req, res) => {
    try {
      return res.json({ feedback: await getSecurityFeedback(currentUserId(req), req.params["emailId"] as string, organizationId(req)) });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post("/emails/:emailId/security-feedback", async (req, res) => {
    try {
      const feedbackType = req.body?.feedbackType as SecurityFeedbackType;
      return res.status(200).json({ feedback: await submitSecurityFeedback(currentUserId(req), req.params["emailId"] as string, organizationId(req), feedbackType) });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post("/emails/:emailId/report", async (req, res) => {
    try {
      const userId = currentUserId(req);
      const emailId = req.params["emailId"] as string;
      const reportType = req.body?.type;
      if (reportType !== "spam" && reportType !== "phishing") {
        throw Object.assign(new Error("Report type must be spam or phishing"), { statusCode: 400 });
      }
      const reason = typeof req.body?.reason === "string" ? req.body.reason : "";
      return res.status(201).json(await createSecurityReport(userId, emailId, reportType as SecurityReportType, reason));
    } catch (error) {
      return sendError(res, error);
    }
  });

  return router;
}
