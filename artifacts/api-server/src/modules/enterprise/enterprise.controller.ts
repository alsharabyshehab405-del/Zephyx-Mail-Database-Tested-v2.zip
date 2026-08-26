import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { requireAuth, type AuthenticatedRequest } from "../../middlewares/auth.js";
import {
  addMember,
  createApiKey,
  createIncident,
  createOrganization,
  createWebhook,
  getOrganizationAccess,
  getSecuritySummary,
  listApiKeys,
  listAuditLogs,
  listIncidents,
  listMembers,
  listOrganizations,
  listWebhooks,
  requireRole,
  revokeApiKey,
  securityCsv,
  securityPdf,
  setWebhookActive,
  updateIncident,
  updateMemberRole,
  type IncidentSeverity,
  type IncidentStatus,
  type OrganizationRole,
} from "./enterprise.service.js";

const OrganizationId = z.string().uuid();
const Name = z.string().trim().min(2).max(160);
const Role = z.enum(["owner", "admin", "security_analyst", "auditor", "member"]);
const IncidentBody = z.object({ title: z.string().trim().min(3).max(200), description: z.string().trim().max(4000).default(""), severity: z.enum(["low", "medium", "high", "critical"]).default("medium") }).strict();
const IncidentPatch = z.object({ status: z.enum(["open", "investigating", "contained", "resolved"]).optional(), severity: z.enum(["low", "medium", "high", "critical"]).optional(), assignedTo: z.string().uuid().nullable().optional() }).strict().refine((value) => Object.keys(value).length > 0, "At least one field must be provided");
const MemberBody = z.object({ email: z.string().email().max(255), role: Role.default("member") }).strict();
const MemberPatch = z.object({ role: Role }).strict();
const ApiKeyBody = z.object({ name: z.string().trim().min(2).max(120), expiresAt: z.string().datetime().nullable().optional() }).strict();
const WebhookBody = z.object({ url: z.string().url().max(2000), events: z.array(z.string().trim().min(1).max(80)).min(1).max(20) }).strict();
const WebhookPatch = z.object({ active: z.boolean() }).strict();

function userId(req: import("express").Request): string { return (req as AuthenticatedRequest).user.sub; }
function errorStatus(error: unknown): number { return (error as { statusCode?: number }).statusCode ?? 500; }
function errorMessage(error: unknown, status: number): string { return status >= 500 ? "Internal server error" : (error as Error).message; }
function sendError(res: import("express").Response, error: unknown) { const status = errorStatus(error); return res.status(status).json({ error: errorMessage(error, status) }); }
function orgId(req: import("express").Request): string { return req.params["organizationId"] as string; }
function validateOrgId(req: import("express").Request): string { const parsed = OrganizationId.safeParse(orgId(req)); if (!parsed.success) throw Object.assign(new Error("Invalid organization id"), { statusCode: 400 }); return parsed.data; }

const writeLimit = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false, message: { error: "Too many security changes. Please try again shortly." } });
const readLimit = rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: true, legacyHeaders: false, message: { error: "Too many security requests. Please try again shortly." } });

export function enterpriseRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/organizations", readLimit, async (req, res) => { try { return res.json({ organizations: await listOrganizations(userId(req)) }); } catch (error) { return sendError(res, error); } });
  router.post("/organizations", writeLimit, async (req, res) => {
    const parsed = z.object({ name: Name }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Organization name must be between 2 and 160 characters" });
    try { return res.status(201).json(await createOrganization(userId(req), parsed.data.name)); } catch (error) { return sendError(res, error); }
  });

  router.get("/:organizationId/security-summary", readLimit, async (req, res) => { try { return res.json(await getSecuritySummary(userId(req), validateOrgId(req))); } catch (error) { return sendError(res, error); } });
  router.get("/:organizationId/members", readLimit, async (req, res) => { try { return res.json({ members: await listMembers(userId(req), validateOrgId(req)) }); } catch (error) { return sendError(res, error); } });
  router.post("/:organizationId/members", writeLimit, async (req, res) => { const parsed = MemberBody.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: "Valid member email and role are required" }); try { return res.status(201).json(await addMember(userId(req), validateOrgId(req), parsed.data.email, parsed.data.role as OrganizationRole)); } catch (error) { return sendError(res, error); } });
  router.patch("/:organizationId/members/:memberId", writeLimit, async (req, res) => { const parsed = MemberPatch.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: "A valid organization role is required" }); try { return res.json(await updateMemberRole(userId(req), validateOrgId(req), req.params["memberId"] as string, parsed.data.role as OrganizationRole)); } catch (error) { return sendError(res, error); } });

  router.get("/:organizationId/incidents", readLimit, async (req, res) => { try { return res.json({ incidents: await listIncidents(userId(req), validateOrgId(req)) }); } catch (error) { return sendError(res, error); } });
  router.post("/:organizationId/incidents", writeLimit, async (req, res) => { const parsed = IncidentBody.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: "Title, description and severity are required" }); try { return res.status(201).json(await createIncident(userId(req), validateOrgId(req), parsed.data as { title: string; description: string; severity: IncidentSeverity })); } catch (error) { return sendError(res, error); } });
  router.patch("/:organizationId/incidents/:incidentId", writeLimit, async (req, res) => { const parsed = IncidentPatch.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: "A valid incident update is required" }); try { return res.json(await updateIncident(userId(req), validateOrgId(req), req.params["incidentId"] as string, parsed.data as { status?: IncidentStatus; severity?: IncidentSeverity; assignedTo?: string | null })); } catch (error) { return sendError(res, error); } });

  router.get("/:organizationId/audit-logs", readLimit, async (req, res) => { try { return res.json({ logs: await listAuditLogs(userId(req), validateOrgId(req)) }); } catch (error) { return sendError(res, error); } });
  router.get("/:organizationId/reports.csv", readLimit, async (req, res) => { try { return res.type("text/csv").setHeader("Content-Disposition", `attachment; filename=zephyx-security-${validateOrgId(req)}.csv`).send(await securityCsv(userId(req), validateOrgId(req))); } catch (error) { return sendError(res, error); } });
  router.get("/:organizationId/reports.pdf", readLimit, async (req, res) => { try { return res.type("application/pdf").setHeader("Content-Disposition", `attachment; filename=zephyx-security-${validateOrgId(req)}.pdf`).send(await securityPdf(userId(req), validateOrgId(req))); } catch (error) { return sendError(res, error); } });

  router.get("/:organizationId/api-keys", readLimit, async (req, res) => { try { return res.json({ apiKeys: await listApiKeys(userId(req), validateOrgId(req)) }); } catch (error) { return sendError(res, error); } });
  router.post("/:organizationId/api-keys", writeLimit, async (req, res) => { const parsed = ApiKeyBody.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: "A valid API key name is required" }); try { return res.status(201).json(await createApiKey(userId(req), validateOrgId(req), parsed.data.name, parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null)); } catch (error) { return sendError(res, error); } });
  router.delete("/:organizationId/api-keys/:keyId", writeLimit, async (req, res) => { try { return res.json(await revokeApiKey(userId(req), validateOrgId(req), req.params["keyId"] as string)); } catch (error) { return sendError(res, error); } });

  router.get("/:organizationId/webhooks", readLimit, async (req, res) => { try { return res.json({ webhooks: await listWebhooks(userId(req), validateOrgId(req)) }); } catch (error) { return sendError(res, error); } });
  router.post("/:organizationId/webhooks", writeLimit, async (req, res) => { const parsed = WebhookBody.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: "A valid HTTPS webhook URL and event list are required" }); try { return res.status(201).json(await createWebhook(userId(req), validateOrgId(req), parsed.data)); } catch (error) { return sendError(res, error); } });
  router.patch("/:organizationId/webhooks/:webhookId", writeLimit, async (req, res) => { const parsed = WebhookPatch.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: "Webhook active state is required" }); try { return res.json(await setWebhookActive(userId(req), validateOrgId(req), req.params["webhookId"] as string, parsed.data.active)); } catch (error) { return sendError(res, error); } });

  return router;
}
