import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../../middlewares/auth.js";
import {
  createCalendarEvent,
  createTask,
  createTemplate,
  deleteCalendarEvent,
  deleteTask,
  deleteTemplate,
  getAnalytics,
  listCalendarEvents,
  listTasks,
  listTemplates,
  suggestCalendarEvent,
  updateTask,
  updateTemplate,
} from "./productivity.service.js";

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

  router.get("/templates", async (req, res) => {
    try { return res.json({ templates: await listTemplates((req as unknown as AuthenticatedRequest).user.sub) }); } catch (error) { return sendError(res, error); }
  });
  router.post("/templates", async (req, res) => {
    try { return res.status(201).json(await createTemplate((req as unknown as AuthenticatedRequest).user.sub, req.body ?? {})); } catch (error) { return sendError(res, error); }
  });
  router.patch("/templates/:id", async (req, res) => {
    try { return res.json(await updateTemplate((req as unknown as AuthenticatedRequest).user.sub, req.params.id as string, req.body ?? {})); } catch (error) { return sendError(res, error); }
  });
  router.delete("/templates/:id", async (req, res) => {
    try { await deleteTemplate((req as unknown as AuthenticatedRequest).user.sub, req.params.id as string); return res.status(204).end(); } catch (error) { return sendError(res, error); }
  });

  router.get("/tasks", async (req, res) => {
    try { return res.json({ tasks: await listTasks((req as unknown as AuthenticatedRequest).user.sub) }); } catch (error) { return sendError(res, error); }
  });
  router.post("/tasks", async (req, res) => {
    try { return res.status(201).json(await createTask((req as unknown as AuthenticatedRequest).user.sub, req.body ?? {})); } catch (error) { return sendError(res, error); }
  });
  router.patch("/tasks/:id", async (req, res) => {
    try { return res.json(await updateTask((req as unknown as AuthenticatedRequest).user.sub, req.params.id as string, req.body ?? {})); } catch (error) { return sendError(res, error); }
  });
  router.delete("/tasks/:id", async (req, res) => {
    try { await deleteTask((req as unknown as AuthenticatedRequest).user.sub, req.params.id as string); return res.status(204).end(); } catch (error) { return sendError(res, error); }
  });

  router.get("/calendar/events", async (req, res) => {
    try { return res.json({ events: await listCalendarEvents((req as unknown as AuthenticatedRequest).user.sub, req.query.from as string | undefined, req.query.to as string | undefined) }); } catch (error) { return sendError(res, error); }
  });
  router.post("/calendar/suggest/:emailId", async (req, res) => {
    try { return res.json(await suggestCalendarEvent((req as unknown as AuthenticatedRequest).user.sub, req.params.emailId as string)); } catch (error) { return sendError(res, error); }
  });
  router.post("/calendar/events", async (req, res) => {
    try { return res.status(201).json(await createCalendarEvent((req as unknown as AuthenticatedRequest).user.sub, req.body ?? {})); } catch (error) { return sendError(res, error); }
  });
  router.delete("/calendar/events/:id", async (req, res) => {
    try { await deleteCalendarEvent((req as unknown as AuthenticatedRequest).user.sub, req.params.id as string); return res.status(204).end(); } catch (error) { return sendError(res, error); }
  });

  router.get("/analytics/overview", async (req, res) => {
    try { return res.json(await getAnalytics((req as unknown as AuthenticatedRequest).user.sub)); } catch (error) { return sendError(res, error); }
  });

  return router;
}
