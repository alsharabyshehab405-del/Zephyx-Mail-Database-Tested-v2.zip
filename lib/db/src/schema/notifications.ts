import { pgTable, text, varchar, boolean, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const deviceRegistrationsTable = pgTable("device_registrations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  platform: varchar("platform", { length: 20 }).notNull(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  encryptedPushToken: text("encrypted_push_token").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("device_registrations_user_token_unique").on(table.userId, table.tokenHash),
  index("device_registrations_user_active_idx").on(table.userId, table.isActive),
]);

export const notificationPreferencesTable = pgTable("notification_preferences", {
  userId: text("user_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  pushEnabled: boolean("push_enabled").notNull().default(true),
  showPreview: boolean("show_preview").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notificationDeliveriesTable = pgTable("notification_deliveries", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  deviceId: text("device_id").references(() => deviceRegistrationsTable.id, { onDelete: "set null" }),
  eventType: varchar("event_type", { length: 80 }).notNull(),
  eventId: varchar("event_id", { length: 160 }).notNull(),
  status: varchar("status", { length: 30 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("notification_deliveries_device_event_unique").on(table.deviceId, table.eventId),
  index("notification_deliveries_user_created_idx").on(table.userId, table.createdAt),
]);

export type DeviceRegistration = typeof deviceRegistrationsTable.$inferSelect;
export type NotificationPreference = typeof notificationPreferencesTable.$inferSelect;
export type NotificationDelivery = typeof notificationDeliveriesTable.$inferSelect;
