import type { Router } from "express";
import { Router as createRouter } from "express";
import { z } from "zod";
import { requireAdmin } from "../../middlewares/auth.js";
import {
  adminListUsers,
  adminGetUser,
  adminUpdateUser,
  adminGetStats,
} from "./admin.service.js";

const AdminListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
}).strict();

const UserIdSchema = z.string().trim().min(1).max(128);

const AdminUpdateUserSchema = z.object({
  role: z.enum(["user", "admin"]).optional(),
  isActive: z.boolean().optional(),
}).strict().refine(
  (data) => data.role !== undefined || data.isActive !== undefined,
  { message: "At least one field must be provided" },
);

function validationMessage(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join("; ");
}

export function adminRouter(): Router {
  const router = createRouter();

  router.get("/users", requireAdmin, async (req, res) => {
    const parsed = AdminListQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      res.status(400).json({ error: validationMessage(parsed.error) });
      return;
    }

    try {
      const result = await adminListUsers(
        parsed.data.page,
        parsed.data.limit,
        parsed.data.search ?? null,
      );
      res.json(result);
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number };
      res.status(e.statusCode ?? 500).json({
        error: (e.statusCode ?? 500) >= 500 ? "Internal server error" : e.message,
      });
    }
  });

  router.get("/users/:id", requireAdmin, async (req, res) => {
    const parsedId = UserIdSchema.safeParse(req.params["id"]);

    if (!parsedId.success) {
      res.status(400).json({ error: "Invalid user id" });
      return;
    }

    try {
      const user = await adminGetUser(parsedId.data);
      res.json(user);
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number };
      res.status(e.statusCode ?? 500).json({
        error: (e.statusCode ?? 500) >= 500 ? "Internal server error" : e.message,
      });
    }
  });

  router.patch("/users/:id", requireAdmin, async (req, res) => {
    const parsedId = UserIdSchema.safeParse(req.params["id"]);
    const parsedBody = AdminUpdateUserSchema.safeParse(req.body);

    if (!parsedId.success) {
      res.status(400).json({ error: "Invalid user id" });
      return;
    }

    if (!parsedBody.success) {
      res.status(400).json({
        error: validationMessage(parsedBody.error),
      });
      return;
    }

    try {
      const user = await adminUpdateUser(parsedId.data, parsedBody.data);
      res.json(user);
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number };
      res.status(e.statusCode ?? 500).json({
        error: (e.statusCode ?? 500) >= 500 ? "Internal server error" : e.message,
      });
    }
  });

  router.get("/stats", requireAdmin, async (_req, res) => {
    try {
      const stats = await adminGetStats();
      res.json(stats);
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number };
      res.status(e.statusCode ?? 500).json({
        error: (e.statusCode ?? 500) >= 500 ? "Internal server error" : e.message,
      });
    }
  });

  return router;
}
