import type { Router } from "express";
import { Router as createRouter } from "express";
import { requireAuth, type AuthenticatedRequest } from "../../middlewares/auth.js";
import { eq, and, count } from "drizzle-orm";
import { db } from "@workspace/db";
import { emailsTable, foldersTable } from "@workspace/db";
import type { Request } from "express";

export function statsRouter(): Router {
  const router = createRouter();

  // GET /stats/inbox
  router.get("/inbox", requireAuth, async (req: Request, res) => {
    const user = (req as AuthenticatedRequest).user;
    const userId = user.sub;

    try {
      const [
        [{ inboxUnread }],
        [{ totalInbox }],
        [{ starredCount }],
        [{ draftsCount }],
        [{ sentCount }],
        [{ trashCount }],
        [{ spamCount }],
        folders,
      ] = await Promise.all([
        db
          .select({ inboxUnread: count() })
          .from(emailsTable)
          .where(
            and(
              eq(emailsTable.userId, userId),
              eq(emailsTable.folder, "inbox"),
              eq(emailsTable.isRead, false),
            ),
          ),
        db
          .select({ totalInbox: count() })
          .from(emailsTable)
          .where(and(eq(emailsTable.userId, userId), eq(emailsTable.folder, "inbox"))),
        db
          .select({ starredCount: count() })
          .from(emailsTable)
          .where(and(eq(emailsTable.userId, userId), eq(emailsTable.isStarred, true))),
        db
          .select({ draftsCount: count() })
          .from(emailsTable)
          .where(and(eq(emailsTable.userId, userId), eq(emailsTable.folder, "drafts"))),
        db
          .select({ sentCount: count() })
          .from(emailsTable)
          .where(and(eq(emailsTable.userId, userId), eq(emailsTable.folder, "sent"))),
        db
          .select({ trashCount: count() })
          .from(emailsTable)
          .where(and(eq(emailsTable.userId, userId), eq(emailsTable.folder, "trash"))),
        db
          .select({ spamCount: count() })
          .from(emailsTable)
          .where(and(eq(emailsTable.userId, userId), eq(emailsTable.folder, "spam"))),
        db.select().from(foldersTable).where(eq(foldersTable.userId, userId)),
      ]);

      const folderCountResults = await Promise.all(
        folders.map(async (f) => {
          const [{ cnt }] = await db
            .select({ cnt: count() })
            .from(emailsTable)
            .where(
              and(eq(emailsTable.userId, userId), eq(emailsTable.customFolderId, f.id)),
            );
          const [{ unread }] = await db
            .select({ unread: count() })
            .from(emailsTable)
            .where(
              and(
                eq(emailsTable.userId, userId),
                eq(emailsTable.customFolderId, f.id),
                eq(emailsTable.isRead, false),
              ),
            );
          return {
            folderId: f.id,
            folderName: f.name,
            count: Number(cnt),
            unread: Number(unread),
          };
        }),
      );

      res.json({
        inboxUnread: Number(inboxUnread),
        totalInbox: Number(totalInbox),
        starredCount: Number(starredCount),
        draftsCount: Number(draftsCount),
        sentCount: Number(sentCount),
        trashCount: Number(trashCount),
        spamCount: Number(spamCount),
        folderCounts: folderCountResults,
      });
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number };
      res.status(e.statusCode ?? 500).json({ error: (e.statusCode ?? 500) >= 500 ? "Internal server error" : e.message });
    }
  });

  return router;
}
