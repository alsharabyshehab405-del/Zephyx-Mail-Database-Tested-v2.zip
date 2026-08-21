import type { Router } from "express";
import { Router as createRouter } from "express";
import { z } from "zod";
import { requireAuth, type AuthenticatedRequest } from "../../middlewares/auth.js";
import { listFolders, createFolder, updateFolder, deleteFolder } from "./folders.service.js";
import type { Request } from "express";

const FolderBodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  color: z.string().trim().min(1).max(64),
  icon: z.string().trim().max(100).nullable().optional(),
}).strict();

const FolderIdSchema = z.string().trim().min(1).max(128);

function validationMessage(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join("; ");
}

export function foldersRouter(): Router {
  const router = createRouter();

  router.get("/", requireAuth, async (req: Request, res) => {
    const user = (req as AuthenticatedRequest).user;

    try {
      const folders = await listFolders(user.sub);
      res.json(folders);
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number };
      res.status(e.statusCode ?? 500).json({
        error: (e.statusCode ?? 500) >= 500 ? "Internal server error" : e.message,
      });
    }
  });

  router.post("/", requireAuth, async (req: Request, res) => {
    const user = (req as AuthenticatedRequest).user;
    const parsed = FolderBodySchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: validationMessage(parsed.error) });
      return;
    }

    try {
      const folder = await createFolder(user.sub, parsed.data);
      res.status(201).json(folder);
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number };
      res.status(e.statusCode ?? 500).json({
        error: (e.statusCode ?? 500) >= 500 ? "Internal server error" : e.message,
      });
    }
  });

  router.patch("/:id", requireAuth, async (req: Request, res) => {
    const user = (req as AuthenticatedRequest).user;
    const parsedId = FolderIdSchema.safeParse(req.params["id"]);
    const parsedBody = FolderBodySchema.safeParse(req.body);

    if (!parsedId.success || !parsedBody.success) {
      res.status(400).json({ error: "Invalid folder request" });
      return;
    }

    try {
      const folder = await updateFolder(user.sub, parsedId.data, parsedBody.data);
      res.json(folder);
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number };
      res.status(e.statusCode ?? 500).json({
        error: (e.statusCode ?? 500) >= 500 ? "Internal server error" : e.message,
      });
    }
  });

  router.delete("/:id", requireAuth, async (req: Request, res) => {
    const user = (req as AuthenticatedRequest).user;
    const parsedId = FolderIdSchema.safeParse(req.params["id"]);

    if (!parsedId.success) {
      res.status(400).json({ error: "Invalid folder id" });
      return;
    }

    try {
      await deleteFolder(user.sub, parsedId.data);
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
