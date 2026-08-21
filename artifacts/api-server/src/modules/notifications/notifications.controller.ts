import type { Request, Router } from "express";
import { Router as createRouter } from "express";
import { z } from "zod";
import { requireAuth, type AuthenticatedRequest } from "../../middlewares/auth.js";
import { getNotificationPreferences, listDevices, listNotificationDeliveries, registerDevice, revokeDevice, updateNotificationPreferences } from "./notifications.service.js";

const deviceSchema = z.object({
  platform: z.enum(["web", "android", "ios"]),
  pushToken: z.string().trim().min(1).max(4096),
}).strict();
const preferencesSchema = z.object({
  pushEnabled: z.boolean().optional(),
  showPreview: z.boolean().optional(),
}).strict();

export function notificationsRouter(): Router {
  const router = createRouter();
  router.get("/devices", requireAuth, async (req: Request, res) => {
    const userId = (req as AuthenticatedRequest).user.sub;
    res.json({ devices: await listDevices(userId) });
  });
  router.post("/devices", requireAuth, async (req: Request, res) => {
    const parsed = deviceSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ code: "INVALID_DEVICE", message: "Invalid device registration", fieldErrors: parsed.error.flatten().fieldErrors }); return; }
    const userId = (req as AuthenticatedRequest).user.sub;
    res.status(201).json(await registerDevice(userId, parsed.data));
  });
  router.delete("/devices/:deviceId", requireAuth, async (req: Request, res) => {
    const userId = (req as AuthenticatedRequest).user.sub;
    await revokeDevice(userId, req.params.deviceId as string);
    res.status(204).end();
  });
  router.get("/delivery-records", requireAuth, async (req: Request, res) => {
    res.json({ records: await listNotificationDeliveries((req as AuthenticatedRequest).user.sub) });
  });
  router.get("/preferences", requireAuth, async (req: Request, res) => {
    res.json(await getNotificationPreferences((req as AuthenticatedRequest).user.sub));
  });
  router.patch("/preferences", requireAuth, async (req: Request, res) => {
    const parsed = preferencesSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ code: "INVALID_NOTIFICATION_PREFERENCES", message: "Invalid notification preferences", fieldErrors: parsed.error.flatten().fieldErrors }); return; }
    res.json(await updateNotificationPreferences((req as AuthenticatedRequest).user.sub, parsed.data));
  });
  return router;
}
