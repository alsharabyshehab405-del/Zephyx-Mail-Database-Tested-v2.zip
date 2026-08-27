import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { requireAuth, type AuthenticatedRequest } from "../../middlewares/auth.js";
import {
  correlateThreatCampaign,
  createPolicy,
  createPrivacyRequest,
  evaluateEnterprisePolicy,
  getSpamLearningSummary,
  listConsents,
  listPolicies,
  listPrivacyRequests,
  listQuarantine,
  listThreatCampaigns,
  quarantineEmail,
  recordConsent,
  recordSpamLearning,
  transitionQuarantine,
  updatePolicy,
} from "./global-completion.service.js";

const UUID = z.string().uuid();
const policyAction = z.enum(["allow", "warn", "quarantine", "block"]);
const policyInput = z.object({
  name: z.string().trim().min(2).max(120),
  scope: z.enum(["organization", "user", "group"]).default("organization"),
  targetUserId: UUID.nullable().optional(),
  targetGroup: z.string().trim().max(120).nullable().optional(),
  enabled: z.boolean().optional(),
  riskThreshold: z.number().int().min(0).max(100).optional(),
  linkAction: policyAction.optional(),
  attachmentAction: policyAction.optional(),
  senderAction: policyAction.optional(),
  allowlist: z.array(z.string().trim().min(1).max(255)).max(500).optional(),
  blocklist: z.array(z.string().trim().min(1).max(255)).max(500).optional(),
}).strict();
const policyPatch = policyInput.partial().extend({ name: z.string().trim().min(2).max(120).optional() }).strict();
const quarantineCreate = z.object({ emailId: UUID, incidentId: UUID.nullable().optional(), reason: z.string().trim().min(3).max(500), riskScore: z.number().int().min(0).max(100) }).strict();
const privacyCreate = z.object({ requestType: z.enum(["export", "delete"]), reason: z.string().trim().max(500).default("") }).strict();
const consentCreate = z.object({ consentType: z.string().trim().min(2).max(80), granted: z.boolean(), scope: z.string().trim().min(1).max(40).default("organization") }).strict();

function userId(req: import("express").Request): string { return (req as AuthenticatedRequest).user.sub; }
function orgId(req: import("express").Request): string { return req.params["organizationId"] as string; }
function statusOf(error: unknown): number { return (error as { statusCode?: number }).statusCode ?? 500; }
function sendError(res: import("express").Response, error: unknown) { const status = statusOf(error); return res.status(status).json({ error: status >= 500 ? "Internal server error" : (error as Error).message }); }

const writeLimit = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false });
const readLimit = rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: true, legacyHeaders: false });

export function globalCompletionRouter(): Router {
  const router = Router();
  router.use(requireAuth);
  router.get("/:organizationId/quarantine", readLimit, async (req, res) => { try { return res.json({ items: await listQuarantine(userId(req), orgId(req)) }); } catch (error) { return sendError(res, error); } });
  router.post("/:organizationId/quarantine", writeLimit, async (req, res) => { const parsed = quarantineCreate.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: "emailId, reason and riskScore are required" }); try { return res.status(201).json(await quarantineEmail(userId(req), orgId(req), parsed.data.emailId, parsed.data.reason, parsed.data.riskScore, parsed.data.incidentId)); } catch (error) { return sendError(res, error); } });
  router.post("/:organizationId/quarantine/:quarantineId/:action", writeLimit, async (req, res) => { const parsed = z.enum(["released", "reported", "appealed"]).safeParse(req.params["action"]); if (!parsed.success) return res.status(400).json({ error: "Invalid quarantine action" }); try { return res.json(await transitionQuarantine(userId(req), orgId(req), req.params["quarantineId"] as string, parsed.data)); } catch (error) { return sendError(res, error); } });

  router.get("/:organizationId/policies", readLimit, async (req, res) => { try { return res.json({ policies: await listPolicies(userId(req), orgId(req)) }); } catch (error) { return sendError(res, error); } });
  router.post("/:organizationId/policies", writeLimit, async (req, res) => { const parsed = policyInput.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: "Valid enterprise policy fields are required" }); try { return res.status(201).json(await createPolicy(userId(req), orgId(req), parsed.data)); } catch (error) { return sendError(res, error); } });
  router.patch("/:organizationId/policies/:policyId", writeLimit, async (req, res) => { const parsed = policyPatch.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: "Valid policy changes are required" }); try { return res.json(await updatePolicy(userId(req), orgId(req), req.params["policyId"] as string, parsed.data)); } catch (error) { return sendError(res, error); } });
  router.post("/:organizationId/policies/evaluate", readLimit, async (req, res) => { const parsed = z.object({ emailId: UUID, riskScore: z.number().int().min(0).max(100), signal: z.enum(["link", "attachment", "sender"]) }).strict().safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: "emailId, riskScore and signal are required" }); try { return res.json(await evaluateEnterprisePolicy(userId(req), orgId(req), parsed.data.emailId, parsed.data.riskScore, parsed.data.signal)); } catch (error) { return sendError(res, error); } });

  router.post("/:organizationId/spam-learning", writeLimit, async (req, res) => { const parsed = z.object({ emailId: UUID, feedbackType: z.enum(["spam", "not_spam"]) }).strict().safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: "emailId and feedbackType are required" }); try { return res.status(201).json(await recordSpamLearning(userId(req), orgId(req), parsed.data.emailId, parsed.data.feedbackType)); } catch (error) { return sendError(res, error); } });
  router.get("/:organizationId/spam-learning", readLimit, async (req, res) => { try { return res.json(await getSpamLearningSummary(userId(req), orgId(req))); } catch (error) { return sendError(res, error); } });

  router.get("/:organizationId/campaigns", readLimit, async (req, res) => { try { return res.json({ campaigns: await listThreatCampaigns(userId(req), orgId(req)) }); } catch (error) { return sendError(res, error); } });
  router.post("/:organizationId/campaigns/correlate", writeLimit, async (req, res) => { const parsed = z.object({ emailId: UUID, riskScore: z.number().int().min(0).max(100), signals: z.array(z.string().trim().min(1).max(160)).max(20).optional() }).strict().safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: "emailId and riskScore are required" }); try { return res.status(201).json(await correlateThreatCampaign(userId(req), orgId(req), parsed.data.emailId, parsed.data.riskScore, parsed.data.signals ?? [])); } catch (error) { return sendError(res, error); } });

  router.post("/:organizationId/privacy-requests", writeLimit, async (req, res) => { const parsed = privacyCreate.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: "requestType and reason are required" }); try { return res.status(201).json(await createPrivacyRequest(userId(req), orgId(req), parsed.data.requestType, parsed.data.reason)); } catch (error) { return sendError(res, error); } });
  router.get("/:organizationId/privacy-requests", readLimit, async (req, res) => { try { return res.json({ requests: await listPrivacyRequests(userId(req), orgId(req)) }); } catch (error) { return sendError(res, error); } });
  router.post("/:organizationId/consents", writeLimit, async (req, res) => { const parsed = consentCreate.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: "consentType and granted are required" }); try { return res.status(201).json(await recordConsent(userId(req), orgId(req), parsed.data.consentType, parsed.data.granted, parsed.data.scope)); } catch (error) { return sendError(res, error); } });
  router.get("/:organizationId/consents", readLimit, async (req, res) => { try { return res.json({ consents: await listConsents(userId(req), orgId(req)) }); } catch (error) { return sendError(res, error); } });
  return router;
}
