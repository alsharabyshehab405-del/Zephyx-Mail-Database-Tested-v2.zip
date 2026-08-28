import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, or } from "drizzle-orm";
import {
  db,
  deviceRegistrationsTable,
  notificationDeliveriesTable,
  notificationPreferencesTable,
} from "@workspace/db";

const TOKEN_ALGORITHM = "aes-256-gcm";
const MAX_TOKEN_LENGTH = 4096;
const ENVELOPE_VERSION = "v1";

type DeviceInput = { platform: "web" | "android" | "ios"; pushToken: string };

export type PushNotification = {
  eventId: string;
  eventType: string;
  userId: string;
  emailId?: string;
  subject?: string;
  bodyPreview?: string;
  showPreview?: boolean;
};

export interface PushProvider {
  readonly state?: "CONFIGURED" | "NOT_CONFIGURED";
  send(device: { platform: string; encryptedPushToken: string }, notification: PushNotification): Promise<"sent" | "failed" | "invalid_token">;
}

export class NotConfiguredPushProvider implements PushProvider {
  readonly state = "NOT_CONFIGURED" as const;
  async send(_device: { platform: string; encryptedPushToken: string }, _notification: PushNotification): Promise<"failed"> {
    return "failed";
  }
}

/** Test-only double. Production runtime must use an approved configured adapter or NotConfiguredPushProvider. */
export class FakePushProvider implements PushProvider {
  public readonly sent: PushNotification[] = [];
  async send(_device: { platform: string; encryptedPushToken: string }, notification: PushNotification): Promise<"sent"> {
    this.sent.push(notification);
    return "sent";
  }
}

function tokenKey(): Buffer {
  const raw = process.env.NOTIFICATION_TOKEN_ENCRYPTION_KEY?.trim();
  if (process.env.NODE_ENV === "production" && (!raw || !/^[0-9a-f]{64,}$/i.test(raw))) {
    throw new Error("NOTIFICATION_TOKEN_ENCRYPTION_KEY is required and must be a strong hex key in production");
  }
  return createHash("sha256").update(raw || "test-notification-key-for-tests-only").digest();
}

export function encryptPushToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(TOKEN_ALGORITHM, tokenKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENVELOPE_VERSION}.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function hashPushToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function notificationPayload(input: PushNotification, showPreview: boolean): PushNotification {
  return showPreview
    ? { ...input, showPreview: true }
    : { eventId: input.eventId, eventType: input.eventType, userId: input.userId, emailId: input.emailId, showPreview: false };
}

export async function registerDevice(userId: string, input: DeviceInput) {
  const token = input.pushToken.trim();
  if (!token || token.length > MAX_TOKEN_LENGTH) {
    throw Object.assign(new Error("pushToken is required and must be bounded"), { statusCode: 400 });
  }
  const tokenHash = hashPushToken(token);
  const encryptedPushToken = encryptPushToken(token);
  const now = new Date();
  return db.transaction(async (tx) => {
    // A token can have only one active owner. Revoke any previous account atomically.
    await tx.update(deviceRegistrationsTable)
      .set({ isActive: false, revokedAt: now })
      .where(and(eq(deviceRegistrationsTable.tokenHash, tokenHash), eq(deviceRegistrationsTable.isActive, true)));
    const [device] = await tx
      .insert(deviceRegistrationsTable)
      .values({ userId, platform: input.platform, tokenHash, encryptedPushToken, isActive: true, revokedAt: null, lastSeenAt: now })
      .onConflictDoUpdate({
        target: [deviceRegistrationsTable.userId, deviceRegistrationsTable.tokenHash],
        set: { encryptedPushToken, platform: input.platform, isActive: true, revokedAt: null, lastSeenAt: now },
      })
      .returning({ id: deviceRegistrationsTable.id, platform: deviceRegistrationsTable.platform, isActive: deviceRegistrationsTable.isActive, lastSeenAt: deviceRegistrationsTable.lastSeenAt });
    return device;
  });
}

export async function listDevices(userId: string) {
  return db.select({ id: deviceRegistrationsTable.id, platform: deviceRegistrationsTable.platform, isActive: deviceRegistrationsTable.isActive, lastSeenAt: deviceRegistrationsTable.lastSeenAt, createdAt: deviceRegistrationsTable.createdAt })
    .from(deviceRegistrationsTable).where(eq(deviceRegistrationsTable.userId, userId));
}

export async function revokeDevice(userId: string, deviceId: string): Promise<void> {
  await db.update(deviceRegistrationsTable).set({ isActive: false, revokedAt: new Date() })
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
  const [record] = await db.insert(notificationDeliveriesTable).values({ ...input, deviceId: input.deviceId ?? null })
    .onConflictDoNothing().returning({ id: notificationDeliveriesTable.id, status: notificationDeliveriesTable.status });
  return record ?? null;
}

export async function listNotificationDeliveries(userId: string) {
  return db.select({ id: notificationDeliveriesTable.id, deviceId: notificationDeliveriesTable.deviceId, eventType: notificationDeliveriesTable.eventType, eventId: notificationDeliveriesTable.eventId, status: notificationDeliveriesTable.status, createdAt: notificationDeliveriesTable.createdAt })
    .from(notificationDeliveriesTable)
    .where(eq(notificationDeliveriesTable.userId, userId));
}

export async function deliverNotification(provider: PushProvider, input: PushNotification): Promise<number> {
  const preferences = await getNotificationPreferences(input.userId);
  if (!preferences.pushEnabled) return 0;
  const devices = await db.select({ id: deviceRegistrationsTable.id, platform: deviceRegistrationsTable.platform, encryptedPushToken: deviceRegistrationsTable.encryptedPushToken })
    .from(deviceRegistrationsTable)
    .where(and(eq(deviceRegistrationsTable.userId, input.userId), eq(deviceRegistrationsTable.isActive, true)));
  let delivered = 0;
  for (const device of devices) {
    const result = await provider.send(device, notificationPayload(input, preferences.showPreview));
    if (result === "invalid_token") await revokeDevice(input.userId, device.id);
    await recordNotificationDelivery({ userId: input.userId, deviceId: device.id, eventType: input.eventType, eventId: input.eventId, status: result });
    if (result === "sent") delivered += 1;
  }
  return delivered;
}
