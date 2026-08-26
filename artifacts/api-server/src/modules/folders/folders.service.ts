import { eq, and, count } from "drizzle-orm";
import { db } from "@workspace/db";
import { foldersTable, emailsTable } from "@workspace/db";

export interface FolderDto {
  name: string;
  color: string;
  icon?: string | null;
}

export async function listFolders(userId: string) {
  const folders = await db
    .select()
    .from(foldersTable)
    .where(eq(foldersTable.userId, userId))
    .orderBy(foldersTable.createdAt);

  const folderCounts = await db
    .select({
      folderId: emailsTable.customFolderId,
      emailCount: count(),
    })
    .from(emailsTable)
    .where(eq(emailsTable.userId, userId))
    .groupBy(emailsTable.customFolderId);

  const countMap = new Map(folderCounts.map((f) => [f.folderId, Number(f.emailCount)]));

  return folders.map((f) => ({
    ...f,
    emailCount: countMap.get(f.id) ?? 0,
    createdAt: f.createdAt.toISOString(),
  }));
}

export async function createFolder(userId: string, dto: FolderDto) {
  const [folder] = await db
    .insert(foldersTable)
    .values({ userId, name: dto.name, color: dto.color, icon: dto.icon ?? null })
    .returning();

  return { ...folder!, emailCount: 0, createdAt: folder!.createdAt.toISOString() };
}

export async function updateFolder(userId: string, folderId: string, dto: FolderDto) {
  const [folder] = await db
    .update(foldersTable)
    .set({ name: dto.name, color: dto.color, icon: dto.icon ?? null })
    .where(and(eq(foldersTable.id, folderId), eq(foldersTable.userId, userId)))
    .returning();

  if (!folder) throw Object.assign(new Error("Folder not found"), { statusCode: 404 });

  const [{ emailCount }] = await db
    .select({ emailCount: count() })
    .from(emailsTable)
    .where(and(eq(emailsTable.userId, userId), eq(emailsTable.customFolderId, folderId)));

  return { ...folder, emailCount: Number(emailCount), createdAt: folder.createdAt.toISOString() };
}

export async function deleteFolder(userId: string, folderId: string) {
  // Move emails back to inbox
  await db
    .update(emailsTable)
    .set({ customFolderId: null, folder: "inbox" })
    .where(and(eq(emailsTable.userId, userId), eq(emailsTable.customFolderId, folderId)));

  await db
    .delete(foldersTable)
    .where(and(eq(foldersTable.id, folderId), eq(foldersTable.userId, userId)));
}
