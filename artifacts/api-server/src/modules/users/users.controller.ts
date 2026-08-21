import type { Router } from "express";
import { Router as createRouter } from "express";
import { z } from "zod";
import { requireAuth, type AuthenticatedRequest } from "../../middlewares/auth.js";
import { getUserById, updateUser, changeUserPassword } from "./users.service.js";
import type { Request } from "express";

const UpdateProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  displayName: z.string().trim().max(120).nullable().optional(),
  avatarUrl: z.string().trim().max(2048).nullable().optional(),
  locale: z.enum(["en", "ar"]).optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
}).strict();

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(8).max(256),
}).strict();

function validationMessage(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join("; ");
}

export function usersRouter(): Router {
  const router = createRouter();

  router.get("/me", requireAuth, async (req: Request, res) => {
    const user = (req as AuthenticatedRequest).user;

    try {
      const profile = await getUserById(user.sub);
      res.json(profile);
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number };
      res.status(e.statusCode ?? 500).json({
        error: (e.statusCode ?? 500) >= 500 ? "Internal server error" : e.message,
      });
    }
  });

  router.patch("/me", requireAuth, async (req: Request, res) => {
    const user = (req as AuthenticatedRequest).user;
    const parsed = UpdateProfileSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: validationMessage(parsed.error) });
      return;
    }

    try {
      const updated = await updateUser(user.sub, parsed.data);
      res.json(updated);
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number };
      res.status(e.statusCode ?? 500).json({
        error: (e.statusCode ?? 500) >= 500 ? "Internal server error" : e.message,
      });
    }
  });

  router.patch("/me/password", requireAuth, async (req: Request, res) => {
    const user = (req as AuthenticatedRequest).user;
    const parsed = ChangePasswordSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: validationMessage(parsed.error) });
      return;
    }

    try {
      await changeUserPassword(
        user.sub,
        parsed.data.currentPassword,
        parsed.data.newPassword,
        user.sid,
      );
      res.status(204).end();
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number };
      res.status(e.statusCode ?? 500).json({
        error: (e.statusCode ?? 500) >= 500 ? "Internal server error" : e.message,
      });
    }
  });

  return router;
}
