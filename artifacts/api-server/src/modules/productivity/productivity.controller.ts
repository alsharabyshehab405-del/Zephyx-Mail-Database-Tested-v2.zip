import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../../middlewares/auth.js";
import {
  createCalendarEvent,
  createFollowUp,
  createTask,
  createTemplate,
  deleteCalendarEvent,
  deleteTask,
  deleteTemplate,
  getAnalytics,
  getWorkspace,
  getWorkspacePreferences,
  listProductivityAccounts,
  setActiveAccount,
  listCalendarEvents,
  listFollowUps,
  listSmartInbox,
  listTasks,
  listTemplates,
  suggestCalendarEvent,
  updateFollowUp,
  updateTask,
  updateWorkspacePreferences,
  updateTemplate,
} from "./productivity.service.js";

function userId(req: import("express").Request): string {
  return (req as unknown as AuthenticatedRequest).user.sub;
}

function statusOf(error: unknown): number {
  return (error as { statusCode?: number }).statusCode ?? 500;
}

function sendError(res: import("express").Response, error: unknown) {
  const status = statusOf(error);
  return res.status(status).json({ error: status >= 500 ? "Internal server error" : (error as Error).message });
}

export function productivityRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/accounts", async (req, res) => {
    try { return res.json(await listProductivityAccounts(userId(req))); } catch (error) { return sendError(res, error); }
  });
  router.patch("/accounts/active", async (req, res) => {
    try { return res.json(await setActiveAccount(userId(req), typeof req.body?.accountId === "string" ? req.body.accountId : null)); } catch (error) { return sendError(res, error); }
  });
  router.get("/workspace", async (req, res) => {
    try { return res.json(await getWorkspace(userId(req), typeof req.query.q === "string" ? req.query.q : "", typeof req.query.accountId === "string" ? req.query.accountId : undefined, typeof req.query.focusMode === "string" ? req.query.focusMode : undefined)); } catch (error) { return sendError(res, error); }
  });
  router.get("/smart-inbox", async (req, res) => {
    try { return res.json(await listSmartInbox(userId(req), typeof req.query.q === "string" ? req.query.q : "", typeof req.query.accountId === "string" ? req.query.accountId : undefined, typeof req.query.focusMode === "string" ? req.query.focusMode as "focus" | "work" | "follow_up" : "focus")); } catch (error) { return sendError(res, error); }
  });
  router.get("/focus", async (req, res) => {
    try { const preferences = await getWorkspacePreferences(userId(req)); return res.json({ mode: preferences.focusMode }); } catch (error) { return sendError(res, error); }
  });
  router.patch("/focus", async (req, res) => {
    try { const updated = await updateWorkspacePreferences(userId(req), { focusMode: req.body?.mode }); return res.json({ mode: updated.focusMode }); } catch (error) { return sendError(res, error); }
  });
  router.get("/preferences", async (req, res) => {
    try { return res.json(await getWorkspacePreferences(userId(req))); } catch (error) { return sendError(res, error); }
  });
  router.patch("/preferences", async (req, res) => {
    try { return res.json(await updateWorkspacePreferences(userId(req), req.body ?? {})); } catch (error) { return sendError(res, error); }
  });

  router.get("/templates", async (req, res) => {
    try { return res.json({ templates: await listTemplates(userId(req)) }); } catch (error) { return sendError(res, error); }
  });
  router.post("/templates", async (req, res) => {
    try { return res.status(201).json(await createTemplate(userId(req), req.body ?? {})); } catch (error) { return sendError(res, error); }
  });
  router.patch("/templates/:id", async (req, res) => {
    try { return res.json(await updateTemplate(userId(req), req.params.id as string, req.body ?? {})); } catch (error) { return sendError(res, error); }
  });
  router.delete("/templates/:id", async (req, res) => {
    try { await deleteTemplate(userId(req), req.params.id as string); return res.status(204).end(); } catch (error) { return sendError(res, error); }
  });

  router.get("/tasks", async (req, res) => {
    try { return res.json({ tasks: await listTasks(userId(req), typeof req.query.accountId === "string" ? req.query.accountId : undefined) }); } catch (error) { return sendError(res, error); }
  });
  router.post("/tasks", async (req, res) => {
    try { return res.status(201).json(await createTask(userId(req), req.body ?? {})); } catch (error) { return sendError(res, error); }
  });
  router.patch("/tasks/:id", async (req, res) => {
    try { return res.json(await updateTask(userId(req), req.params.id as string, req.body ?? {})); } catch (error) { return sendError(res, error); }
  });
  router.delete("/tasks/:id", async (req, res) => {
    try { await deleteTask(userId(req), req.params.id as string); return res.status(204).end(); } catch (error) { return sendError(res, error); }
  });

  router.get("/follow-ups", async (req, res) => {
    try { return res.json({ followUps: await listFollowUps(userId(req), typeof req.query.accountId === "string" ? req.query.accountId : undefined) }); } catch (error) { return sendError(res, error); }
  });
  router.post("/follow-ups", async (req, res) => {
    try { return res.status(201).json(await createFollowUp(userId(req), req.body ?? {})); } catch (error) { return sendError(res, error); }
  });
  router.patch("/follow-ups/:id", async (req, res) => {
    try { return res.json(await updateFollowUp(userId(req), req.params.id as string, req.body ?? {})); } catch (error) { return sendError(res, error); }
  });

  router.get("/calendar/events", async (req, res) => {
    try { return res.json({ events: await listCalendarEvents(userId(req), req.query.from as string | undefined, req.query.to as string | undefined, typeof req.query.accountId === "string" ? req.query.accountId : undefined) }); } catch (error) { return sendError(res, error); }
  });
  router.post("/calendar/suggest/:emailId", async (req, res) => {
    try { return res.json(await suggestCalendarEvent(userId(req), req.params.emailId as string)); } catch (error) { return sendError(res, error); }
  });
  router.post("/calendar/events", async (req, res) => {
    try { return res.status(201).json(await createCalendarEvent(userId(req), req.body ?? {})); } catch (error) { return sendError(res, error); }
  });
  router.delete("/calendar/events/:id", async (req, res) => {
    try { await deleteCalendarEvent(userId(req), req.params.id as string); return res.status(204).end(); } catch (error) { return sendError(res, error); }
  });

  router.get("/analytics/overview", async (req, res) => {
    try { return res.json(await getAnalytics(userId(req))); } catch (error) { return sendError(res, error); }
  });

  return router;
}
