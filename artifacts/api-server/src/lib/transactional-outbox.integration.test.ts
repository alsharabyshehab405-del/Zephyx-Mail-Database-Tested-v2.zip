import { and, eq } from "drizzle-orm";
import { db, emailDispatchOutboxTable, emailsTable, usersTable } from "@workspace/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sendEmail } from "../modules/emails/emails.service.js";

const userId = crypto.randomUUID();
const emailAddress = `transactional-${Date.now()}@test.invalid`;

describe("Transactional email outbox", () => {
  beforeAll(async () => {
    await db.insert(usersTable).values({ id: userId, email: emailAddress, passwordHash: "test-hash", firstName: "Transaction", lastName: "Test" });
  });

  it("rolls back the scheduled Email when Outbox insertion fails", async () => {
    const subject = `Rollback ${Date.now()}`;
    await expect(sendEmail(userId, {
      subject,
      to: [{ email: "recipient@test.invalid" }],
      bodyHtml: "<p>rollback</p>",
      scheduledAt: new Date(Date.now() + 60_000).toISOString(),
    }, {
      outboxWriter: async () => { throw new Error("forced outbox failure"); },
    })).rejects.toThrow("forced outbox failure");
    const emails = await db.select({ id: emailsTable.id }).from(emailsTable).where(and(eq(emailsTable.userId, userId), eq(emailsTable.subject, subject)));
    expect(emails).toHaveLength(0);
    const outbox = await db.select({ id: emailDispatchOutboxTable.id }).from(emailDispatchOutboxTable).where(eq(emailDispatchOutboxTable.emailId, "missing"));
    expect(outbox).toHaveLength(0);
  });

  afterAll(async () => {
    await db.delete(emailDispatchOutboxTable).where(eq(emailDispatchOutboxTable.emailId, "missing"));
    await db.delete(emailsTable).where(eq(emailsTable.userId, userId));
    await db.delete(usersTable).where(eq(usersTable.id, userId));
  });
});
