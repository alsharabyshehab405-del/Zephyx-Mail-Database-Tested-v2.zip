import { prisma } from "../../lib/prisma.js";
import { eq, ilike, or, count, and, gte, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable, emailsTable } from "@workspace/db";

export async function adminListUsers(
  page: number,
  limit: number,
  search?: string | null,
) {
  const offset = (page - 1) * limit;
  const conditions = [];

  if (search) {
    const term = `%${search}%`;
    conditions.push(
      or(
        ilike(usersTable.email, term),
        ilike(usersTable.firstName, term),
        ilike(usersTable.lastName, term),
      )!,
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [users, [{ total }]] = await Promise.all([
    db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        displayName: usersTable.displayName,
        role: usersTable.role,
        isActive: usersTable.isActive,
        createdAt: usersTable.createdAt,
        lastLoginAt: usersTable.lastLoginAt,
      })
      .from(usersTable)
      .where(whereClause)
      .orderBy(sql`${usersTable.createdAt} DESC`)
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(usersTable).where(whereClause),
  ]);

  const userIds = users.map((u) => u.id);
  const emailCounts =
    userIds.length > 0
      ? await db
          .select({ userId: emailsTable.userId, cnt: count() })
          .from(emailsTable)
          .where(
            or(...userIds.map((id) => eq(emailsTable.userId, id)))!,
          )
          .groupBy(emailsTable.userId)
      : [];

  const countMap = new Map(emailCounts.map((e) => [e.userId, Number(e.cnt)]));

  return {
    users: users.map((u) => ({
      ...u,
      emailCount: countMap.get(u.id) ?? 0,
      createdAt: u.createdAt.toISOString(),
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    })),
    total: Number(total),
    page,
    limit,
  };
}

export async function adminGetUser(userId: string) {
  const [user] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      displayName: usersTable.displayName,
      role: usersTable.role,
      isActive: usersTable.isActive,
      createdAt: usersTable.createdAt,
      lastLoginAt: usersTable.lastLoginAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) throw Object.assign(new Error("User not found"), { statusCode: 404 });

  const [{ emailCount }] = await db
    .select({ emailCount: count() })
    .from(emailsTable)
    .where(eq(emailsTable.userId, userId));

  return {
    ...user,
    emailCount: Number(emailCount),
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  };
}

export async function adminUpdateUser(
  userId: string,
  dto: { role?: "user" | "admin"; isActive?: boolean },
) {
  const [user] = await db
    .update(usersTable)
    .set({ ...dto, updatedAt: new Date() })
    .where(eq(usersTable.id, userId))
    .returning({
      id: usersTable.id,
      email: usersTable.email,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      displayName: usersTable.displayName,
      role: usersTable.role,
      isActive: usersTable.isActive,
      createdAt: usersTable.createdAt,
      lastLoginAt: usersTable.lastLoginAt,
    });

  if (!user) throw Object.assign(new Error("User not found"), { statusCode: 404 });

  // Role changes and account activation changes are security-sensitive.
  // Revoke existing sessions so old access/refresh credentials cannot
  // continue operating with stale privileges.
  if (dto.role !== undefined || dto.isActive !== undefined) {
    await prisma.refreshToken.updateMany({
      where: {
        userId,
        revoked: false,
      },
      data: {
        revoked: true,
        revokedAt: new Date(),
      },
    });
  }

  const [{ emailCount }] = await db
    .select({ emailCount: count() })
    .from(emailsTable)
    .where(eq(emailsTable.userId, userId));

  return {
    ...user,
    emailCount: Number(emailCount),
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  };
}

export async function adminGetStats() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    [{ totalUsers }],
    [{ activeUsers }],
    [{ totalEmails }],
    [{ emailsSentToday }],
    [{ newUsersThisWeek }],
  ] = await Promise.all([
    db.select({ totalUsers: count() }).from(usersTable),
    db.select({ activeUsers: count() }).from(usersTable).where(eq(usersTable.isActive, true)),
    db.select({ totalEmails: count() }).from(emailsTable),
    db
      .select({ emailsSentToday: count() })
      .from(emailsTable)
      .where(
        and(
          eq(emailsTable.folder, "sent"),
          gte(emailsTable.createdAt, startOfToday),
        ),
      ),
    db
      .select({ newUsersThisWeek: count() })
      .from(usersTable)
      .where(gte(usersTable.createdAt, startOfWeek)),
  ]);

  // emails by day for the past 7 days
  const emailsByDay = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const [{ cnt }] = await db
      .select({ cnt: count() })
      .from(emailsTable)
      .where(
        and(
          gte(emailsTable.createdAt, dayStart),
          sql`${emailsTable.createdAt} < ${dayEnd}`,
        ),
      );
    emailsByDay.push({
      date: dayStart.toISOString().split("T")[0],
      count: Number(cnt),
    });
  }

  return {
    totalUsers: Number(totalUsers),
    activeUsers: Number(activeUsers),
    totalEmails: Number(totalEmails),
    emailsSentToday: Number(emailsSentToday),
    newUsersThisWeek: Number(newUsersThisWeek),
    emailsByDay,
  };
}
