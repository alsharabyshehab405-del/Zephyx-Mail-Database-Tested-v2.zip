import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { comparePassword, hashPassword } from "../../lib/hash.js";
import { prisma } from "../../lib/prisma.js";

export type UpdateProfileDto = {
  firstName?: string;
  lastName?: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  locale?: "en" | "ar";
  theme?: "light" | "dark" | "system";
};

const publicUserSelection = {
  id: usersTable.id,
  email: usersTable.email,
  firstName: usersTable.firstName,
  lastName: usersTable.lastName,
  displayName: usersTable.displayName,
  avatarUrl: usersTable.avatarUrl,
  role: usersTable.role,
  locale: usersTable.locale,
  theme: usersTable.theme,
  emailVerifiedAt: usersTable.emailVerifiedAt,
  createdAt: usersTable.createdAt,
};

export async function getUserById(userId: string) {
  const [user] = await db
    .select(publicUserSelection)
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) throw Object.assign(new Error("User not found"), { statusCode: 404 });
  return user;
}

export async function updateUser(userId: string, dto: UpdateProfileDto) {
  const cleanDto = Object.fromEntries(
    Object.entries(dto).filter(([, value]) => value !== undefined),
  ) as UpdateProfileDto;

  const [user] = await db
    .update(usersTable)
    .set({ ...cleanDto, updatedAt: new Date() })
    .where(eq(usersTable.id, userId))
    .returning(publicUserSelection);

  if (!user) throw Object.assign(new Error("User not found"), { statusCode: 404 });
  return user;
}

export async function changeUserPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  currentSessionId?: string,
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw Object.assign(new Error("User not found"), { statusCode: 404 });

  const valid = await comparePassword(currentPassword, user.passwordHash);
  if (!valid) {
    throw Object.assign(new Error("Current password is incorrect"), { statusCode: 400 });
  }

  const passwordHash = await hashPassword(newPassword);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    if (currentSessionId) {
      await tx.refreshToken.updateMany({
        where: { userId, revoked: false, NOT: { id: currentSessionId } },
        data: { revoked: true, revokedAt: now },
      });
    } else {
      await tx.refreshToken.updateMany({
        where: { userId, revoked: false },
        data: { revoked: true, revokedAt: now },
      });
    }
  });
}
