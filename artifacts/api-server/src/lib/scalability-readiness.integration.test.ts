import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, emailDispatchOutboxTable, emailsTable, usersTable } from "@workspace/db";
import { reserveDueOutboxJobs } from "./outbox.js";

const userId = crypto.randomUUID();
const userEmail = `scalability-${Date.now()}@test.invalid`;
const emailIds = Array.from({ length: 12 }, () => crypto.randomUUID());
const outboxIds = Array.from({ length: 12 }, () => crypto.randomUUID());

function dueDate(): Date {
  return new Date(Date.now() - 60_000);
}

describe("Scalability readiness PostgreSQL controls", () => {
  beforeAll(async () => {
    await db.insert(usersTable).values({
      id: userId,
      email: userEmail,
      passwordHash: "test-hash",
      firstName: "Scale",
      lastName: "Test",
    });
    await db.insert(emailsTable).values(emailIds.map((id) => ({
      id,
      userId,
      fromEmail: userEmail,
      subject: "Scalability fixture",
      status: "scheduled" as const,
      scheduledAt: dueDate(),
    })));
    await db.insert(emailDispatchOutboxTable).values(outboxIds.map((id, index) => ({
      id,
      emailId: emailIds[index]!,
      jobKey: `scalability:${id}`,
      queueName: "email-scheduled",
      status: "pending" as const,
      attempts: 0,
      maxAttempts: 3,
      availableAt: dueDate(),
    })));
  });

  it("has targeted cursor, folder, unread, label, and scheduler indexes", async () => {
    const result = await db.execute(sql`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN (
          'emails_user_folder_created_id_idx',
          'emails_user_unread_created_id_idx',
          'emails_user_custom_folder_created_id_idx',
          'emails_user_labels_gin_idx',
          'email_dispatch_outbox_due_next_attempt_idx'
        )
    `);
    const names = new Set(result.rows.map((row) => String((row as { indexname: string }).indexname)));
    expect(names).toEqual(new Set([
      "emails_user_folder_created_id_idx",
      "emails_user_unread_created_id_idx",
      "emails_user_custom_folder_created_id_idx",
      "emails_user_labels_gin_idx",
      "email_dispatch_outbox_due_next_attempt_idx",
    ]));
  });

  it("reserves concurrent scheduler batches without duplicate rows", async () => {
    const [first, second] = await Promise.all([
      db.transaction((tx) => reserveDueOutboxJobs(tx, 6, new Date(), 60_000)),
      db.transaction((tx) => reserveDueOutboxJobs(tx, 6, new Date(), 60_000)),
    ]);
    const reserved = [...first, ...second];
    expect(reserved).toHaveLength(12);
    expect(new Set(reserved.map((row) => row.id)).size).toBe(12);
    expect(reserved.every((row) => row.status === "publishing")).toBe(true);
  });

  afterAll(async () => {
    await db.delete(emailDispatchOutboxTable).where(inArray(emailDispatchOutboxTable.id, outboxIds));
    await db.delete(emailsTable).where(and(eq(emailsTable.userId, userId), inArray(emailsTable.id, emailIds)));
    await db.delete(usersTable).where(eq(usersTable.id, userId));
  });
});
