import { pgTable, text, varchar, timestamp, integer } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const foldersTable = pgTable("folders", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  color: varchar("color", { length: 20 }).notNull().default("#6366f1"),
  icon: varchar("icon", { length: 50 }),
  emailCount: integer("email_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Folder = typeof foldersTable.$inferSelect;
export type InsertFolder = typeof foldersTable.$inferInsert;
