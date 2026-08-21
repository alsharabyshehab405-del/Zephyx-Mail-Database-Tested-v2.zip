import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  db,
  deviceRegistrationsTable,
  notificationDeliveriesTable,
  notificationPreferencesTable,
} from "@workspace/db";

const TOKEN_ALGORITHM = "aes-256-gcm";
const MAX_TOKEN_LENGTH = 4096;

type DeviceInput = { platform: "web" | "android" | "ios"; pushToken: string };

export type PushNotification = {
  eventId: string;
  eventType: string;
  userId: string;
  emailId?: string;
};

export interface PushProvider {
  send(device: { platform: string; encryptedPushToken: string }, notification: PushNotification): Promise<"sent" | "failed">;
}

export class FakePushProvider implements PushProvider {
  public readonly sent: PushNotification[] = [];
  async send(_device: { platform: string; encryptedPushToken: string }, notification: PushNotification): Promise<"sent"> {
    this.sent.push(notification);
    return "sent";
  }
}

function tokenKey(): Buffer {
  return createHash("sha256")
    .update(process.env.NOTIFICATION_TOKEN_ENCRYPTION_KEY ?? "dev-only-notification-key")
    .digest();
}

function encryptPushToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(TOKEN_ALGORITHM, tokenKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function hashPushToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function registerDevice(userId: string, input: DeviceInput) {
  const token = input.pushToken.trim();
  if (!token || token.length > MAX_TOKEN_LENGTH) {
    throw Object.assign(new Error("pushToken is required and must be bounded"), { statusCode: 400 });
  }
  const tokenHash = hashPushToken(token);
  const encryptedPushToken = encryptPushToken(token);
  const [device] = await db
    .insert(deviceRegistrationsTable)
    .values({ userId, platform: input.platform, tokenHash, encryptedPushToken, isActive: true, revokedAt: null, lastSeenAt: new Date() })
    .onConflictDoUpdate({
      target: [deviceRegistrationsTable.userId, deviceRegistrationsTable.tokenHash],
      set: { encryptedPushToken, platform: input.platform, isActive: true, revokedAt: null, lastSeenAt: new Date() },
    })
    .returning({ id: deviceRegistrationsTable.id, platform: deviceRegistrationsTable.platform, isActive: deviceRegistrationsTable.isActive, lastSeenAt: deviceRegistrationsTable.lastSeenAt });
  return device;
}

export async function listDevices(userId: string) {
  return db
    .select({ id: deviceRegistrationsTable.id, platform: deviceRegistrationsTable.platform, isActive: deviceRegistrationsTable.isActive, lastSeenAt: deviceRegistrationsTable.lastSeenAt, createdAt: deviceRegistrationsTable.createdAt })
    .from(deviceRegistrationsTable)
    .where(eq(deviceRegistrationsTable.userId, userId));
}

export async function revokeDevice(userId: string, deviceId: string): Promise<void> {
  await db.update(deviceRegistrationsTable)
    .set({ isActive: false, revokedAt: new Date() })
    .where(and(eq(deviceRegistrationsTable.id, deviceId), eq(deviceRegistrationsTable.userId, userId)));
}

export async function getNotificationPreferences(userId: string) {
  const [preferences] = await db.select().from(notificationPreferencesTable).where(eq(notificationPreferencesTable.userId, userId)).limit(1);
  return preferences ?? { userId, pushEnabled: true, showPreview: false };
}

export async function updateNotificationPreferences(userId: string, input: { pushEnabled?: boolean; showPreview?: boolean }) {
  const [preferences] = await db.insert(notificationPreferencesTable)
    .values({ userId, pushEnabled: input.pushEnabled ?? true, showPreview: input.showPreview ?? false })
    .onConflictDoUpdate({ target: notificationPreferencesTable.userId, set: { ...input, updatedAt: new Date() } })
    .returning();
  return preferences;
}

export async function recordNotificationDelivery(input: { userId: string; deviceId?: string | null; eventType: string; eventId: string; status: string }) {
  const [record] = await db.insert(notificationDeliveriesTable).values({ ...input, deviceId: input.deviceId ?? null }).onConflictDoNothing().returning({ id: notificationDeliveriesTable.id, status: notificationDeliveriesTable.status });
  return record ?? null;
}
