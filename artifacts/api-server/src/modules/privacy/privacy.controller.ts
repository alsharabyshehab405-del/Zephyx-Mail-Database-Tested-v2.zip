import { and, desc, eq, gt } from "drizzle-orm";
import { Router } from "express";
import {
  auditLogsTable,
  db,
  deviceRegistrationsTable,
  gmailConnectionsTable,
  notificationPreferencesTable,
  refreshTokensTable,
} from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../../middlewares/auth.js";
import { getWorkspacePreferences, updateWorkspacePreferences } from "../productivity/productivity.service.js";

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

export async function getPrivacyCenterState(ownerId: string) {
  const preferences = await getWorkspacePreferences(ownerId);
  const now = new Date();
  const [sessions, accessLog, connections, devices, pushPreference] = await Promise.all([
    db.select({ id: refreshTokensTable.id, deviceName: refreshTokensTable.deviceName, userAgent: refreshTokensTable.userAgent, createdAt: refreshTokensTable.createdAt, lastUsedAt: refreshTokensTable.lastUsedAt }).from(refreshTokensTable).where(and(eq(refreshTokensTable.userId, ownerId), eq(refreshTokensTable.revoked, false), gt(refreshTokensTable.expiresAt, now))).orderBy(desc(refreshTokensTable.lastUsedAt), desc(refreshTokensTable.createdAt)).limit(20),
    db.select({ id: auditLogsTable.id, action: auditLogsTable.action, targetType: auditLogsTable.targetType, success: auditLogsTable.success, createdAt: auditLogsTable.createdAt }).from(auditLogsTable).where(eq(auditLogsTable.userId, ownerId)).orderBy(desc(auditLogsTable.createdAt)).limit(30),
    db.select({ syncStatus: gmailConnectionsTable.syncStatus }).from(gmailConnectionsTable).where(eq(gmailConnectionsTable.userId, ownerId)),
    db.select({ isActive: deviceRegistrationsTable.isActive }).from(deviceRegistrationsTable).where(eq(deviceRegistrationsTable.userId, ownerId)),
    db.select({ pushEnabled: notificationPreferencesTable.pushEnabled }).from(notificationPreferencesTable).where(eq(notificationPreferencesTable.userId, ownerId)).limit(1),
  ]);
  const gmailConfigured = Boolean(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET);
  const aiConfigured = Boolean(process.env.AI_PROVIDER_URL || process.env.OPENAI_API_KEY || process.env.BUILT_IN_FORGE_API_URL);
  const clamavConfigured = Boolean(process.env.CLAMAV_HOST || process.env.CLAMAV_SOCKET);
  const pushConfigured = Boolean((process.env.FCM_SERVER_KEY || process.env.VAPID_PUBLIC_KEY) && devices.some((device) => device.isActive) && pushPreference[0]?.pushEnabled !== false);
  return {
    controls: {
      externalImagesBlocked: preferences.privacyExternalImagesBlocked,
      trackingPixelsBlocked: preferences.privacyTrackingPixelsBlocked,
    },
    encryption: {
      status: "transport_only" as const,
      label: "Transport encryption is active when HTTPS is configured; end-to-end encryption is not configured.",
    },
    sessions: sessions.map((session) => ({ ...session, createdAt: session.createdAt.toISOString(), lastUsedAt: session.lastUsedAt?.toISOString() ?? null, current: false })),
    accessLog: accessLog.map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() })),
    providers: {
      ai: aiConfigured ? "connected" as const : "not_configured" as const,
      gmail: gmailConfigured && connections.some((connection) => connection.syncStatus === "connected") ? "connected" as const : "not_configured" as const,
      outlook: "not_configured" as const,
      clamav: clamavConfigured ? "connected" as const : "not_configured" as const,
      push: pushConfigured ? "connected" as const : "not_configured" as const,
    },
  };
}

export function privacyRouter(): Router {
  const router = Router();
  router.use(requireAuth);
  router.get("/center", async (req, res) => {
    try { return res.json(await getPrivacyCenterState(userId(req))); } catch (error) { return sendError(res, error); }
  });
  router.patch("/center", async (req, res) => {
    try {
      const body = req.body ?? {};
      if (body.externalImagesBlocked !== undefined && typeof body.externalImagesBlocked !== "boolean") throw Object.assign(new Error("externalImagesBlocked must be boolean"), { statusCode: 400 });
      if (body.trackingPixelsBlocked !== undefined && typeof body.trackingPixelsBlocked !== "boolean") throw Object.assign(new Error("trackingPixelsBlocked must be boolean"), { statusCode: 400 });
      await updateWorkspacePreferences(userId(req), { privacyExternalImagesBlocked: body.externalImagesBlocked, privacyTrackingPixelsBlocked: body.trackingPixelsBlocked });
      return res.json(await getPrivacyCenterState(userId(req)));
    } catch (error) { return sendError(res, error); }
  });
  return router;
}
