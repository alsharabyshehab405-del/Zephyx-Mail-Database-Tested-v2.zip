import { pgTable, text, varchar, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);

export const SUPPORTED_LOCALES = [
  "en",
  "ar",
  "es",
  "fr",
  "de",
  "pt",
  "it",
  "tr",
  "ru",
  "zh-CN",
  "ja",
  "ko",
  "hi",
  "id",
  "ur",
] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const RTL_LOCALES = ["ar", "ur"] as const;

export const localeEnum = pgEnum("locale", [...SUPPORTED_LOCALES]);
export const themeEnum = pgEnum("theme", ["light", "dark", "system"]);

export const usersTable = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  displayName: varchar("display_name", { length: 200 }),
  avatarUrl: text("avatar_url"),
  role: userRoleEnum("role").notNull().default("user"),
  isActive: boolean("is_active").notNull().default(true),
  locale: localeEnum("locale").notNull().default("en"),
  theme: themeEnum("theme").notNull().default("system"),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastLoginAt: true,
  emailVerifiedAt: true,
});

export const selectUserSchema = createSelectSchema(usersTable);

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
export type PublicUser = Omit<User, "passwordHash">;
