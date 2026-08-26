import type { Request, Response, Router } from "express";
import { raw, Router as createRouter } from "express";
import { logger } from "../../lib/logger.js";
import { claimSendIdempotency, completeSendIdempotency, failSendIdempotency } from "../../lib/idempotency.js";
import { requireAuth, type AuthenticatedRequest } from "../../middlewares/auth.js";
import {
  listEmails,
  getEmail,
  sendEmail,
  updateDraft,
  trashEmail,
  deleteEmailPermanent,
  markEmailRead,
  toggleEmailStar,
  moveEmail,
  cancelEmailSend,
  snoozeEmail,
  unsnoozeEmail,
  type EmailFolder,
  type SendEmailDto,
} from "./emails.service.js";
import {
  createPersistentAttachment,
  deleteOwnedUnreferencedAttachment,
  getAttachmentForUser,
  MAX_ATTACHMENT_SIZE,
} from "./attachments.service.js";


function assertNever(value: never): never {
  throw new Error(`Unhandled Idempotency claim variant: ${String(value)}`);
}

function sendEmailControllerError(res: Response, err: unknown): void {
  const error = err as Error & { statusCode?: number };
  const statusCode = error.statusCode ?? 500;

  if (statusCode >= 500) {
    logger.error({ err: error }, "Email request failed");
  }

  res.status(statusCode).json({
    error: statusCode >= 500 ? "Internal server error" : error.message,
  });
}

function decodeAttachmentFilename(value: string | undefined): string {
  if (!value) return "attachment";

  try {
    return decodeURIComponent(value).trim() || "attachment";
  } catch {
    return value.trim() || "attachment";
  }
}

function contentDisposition(filename: string, download: boolean): string {
  const fallback = filename
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_")
    .slice(0, 180) || "attachment";
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `${download ? "attachment" : "inline"}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function parseByteRange(value: string | undefined, size: number): { start: number; end: number } | null {
  if (!value) return null;

  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match) throw Object.assign(new Error("Invalid Range header"), { statusCode: 416 });

  const rawStart = match[1] ?? "";
  const rawEnd = match[2] ?? "";

  if (!rawStart && !rawEnd) {
    throw Object.assign(new Error("Invalid Range header"), { statusCode: 416 });
  }

  let start: number;
  let end: number;

  if (!rawStart) {
    const suffixLength = Number.parseInt(rawEnd, 10);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) {
      throw Object.assign(new Error("Invalid Range header"), { statusCode: 416 });
    }
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number.parseInt(rawStart, 10);
    end = rawEnd ? Number.parseInt(rawEnd, 10) : size - 1;
  }

  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) {
    throw Object.assign(new Error("Requested range is not satisfiable"), { statusCode: 416 });
  }

  return { start, end: Math.min(end, size - 1) };
}

export function emailsRouter(): Router {
  const router = createRouter();

  // GET /emails
  router.get("/", requireAuth, async (req: Request, res) => {
    const user = (req as AuthenticatedRequest).user;

    const { folder, folderId, search, unreadOnly, dateFrom, dateTo, hasAttachments, label, status, page, limit, cursor, accountId } = req.query as Record<
      string,
      string | undefined
    >;

    try {
      const result = await listEmails(user.sub, {
        folder: folder as EmailFolder | undefined,
        folderId: folderId ?? null,
        search: search ?? null,
        unreadOnly: unreadOnly === "true",
        dateFrom: dateFrom ?? null,
        dateTo: dateTo ?? null,
        hasAttachments: hasAttachments === undefined ? undefined : hasAttachments === "true",
        label: label ?? null,
        status: status as import("./emails.service.js").EmailStatus | undefined,
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 20,
        cursor: cursor ?? null,
        accountId: accountId ?? undefined,
      });

      res.json(result);
    } catch (err: unknown) {
      sendEmailControllerError(res, err);
    }
  });

  // POST /emails/attachments
  router.post(
    "/attachments",
    requireAuth,
    raw({
      type: () => true,
      limit: MAX_ATTACHMENT_SIZE,
    }),
    async (req: Request, res) => {
      const user = (req as AuthenticatedRequest).user;

      try {
        const fileBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
        const attachment = await createPersistentAttachment({
          ownerUserId: user.sub,
          filename: decodeAttachmentFilename(req.get("x-file-name") ?? undefined),
          mimeType: req.get("content-type") ?? undefined,
          contents: fileBuffer,
        });

        res.status(201).json(attachment);
      } catch (err: unknown) {
        const error = err as Error & { statusCode?: number; type?: string };
        const isTooLarge =
          error.type === "entity.too.large" || error.message.toLowerCase().includes("too large");

        res.status(isTooLarge ? 413 : (error.statusCode ?? 500)).json({
          error: isTooLarge ? "Attachment exceeds the 25 MB limit" : ((error.statusCode ?? 500) >= 500 ? "Internal server error" : error.message),
        });
      }
    },
  );

  const serveAttachment = async (req: Request, res: Response) => {
    const user = (req as AuthenticatedRequest).user;
    const attachmentId = req.params["attachmentId"] as string;
    let totalSize: number | null = null;

    try {
      const { record, contents } = await getAttachmentForUser(user.sub, attachmentId);
      totalSize = contents.length;
      const range = parseByteRange(req.get("range") ?? undefined, contents.length);
      const download = req.query["download"] === "1" || req.query["download"] === "true";

      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.setHeader("Content-Type", record.mimeType);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Disposition", contentDisposition(record.filename, download));

      if (range) {
        const body = contents.subarray(range.start, range.end + 1);
        res.status(206);
        res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${contents.length}`);
        res.setHeader("Content-Length", String(body.length));
        if (req.method === "HEAD") res.end();
        else res.send(body);
        return;
      }

      res.setHeader("Content-Length", String(contents.length));
      if (req.method === "HEAD") res.end();
      else res.send(contents);
    } catch (err: unknown) {
      const error = err as Error & { statusCode?: number };
      const statusCode = error.statusCode ?? 500;

      if (statusCode === 416) {
        res.setHeader("Content-Range", `bytes */${totalSize ?? 0}`);
      }

      if (statusCode >= 500) {
        logger.error({ err: error }, "Attachment request failed");
      }

      res.status(statusCode).json({
        error: statusCode >= 500 ? "Internal server error" : error.message,
      });
    }
  };

  router.get("/attachments/:attachmentId", requireAuth, serveAttachment);
  router.head("/attachments/:attachmentId", requireAuth, serveAttachment);

  router.delete("/attachments/:attachmentId", requireAuth, async (req: Request, res) => {
    const user = (req as AuthenticatedRequest).user;
    const attachmentId = req.params["attachmentId"] as string;

    try {
      await deleteOwnedUnreferencedAttachment(user.sub, attachmentId);
      res.status(204).end();
    } catch (err: unknown) {
      sendEmailControllerError(res, err);
    }
  });

  // POST /emails
  router.post("/", requireAuth, async (req: Request, res) => {
    const user = (req as AuthenticatedRequest).user;

    let idempotencyKey: string | undefined;
    let canSend = false;
    try {
      idempotencyKey = req.get("Idempotency-Key") ?? undefined;
      if (!idempotencyKey) {
        canSend = true;
      } else {
        const claim = await claimSendIdempotency(user.sub, idempotencyKey, req.body);
        switch (claim.kind) {
          case "claimed":
            canSend = true;
            break;
          case "completed":
            res.status(claim.responseStatus ?? 200).json(claim.responseBody);
            return;
          case "processing":
            res.setHeader("Retry-After", "2");
            res.status(409).json({ error: "A request with this Idempotency-Key is still processing" });
            return;
          case "failed":
            res.setHeader("Retry-After", "0");
            res.status(409).json({ error: "The previous request failed; retry the same request to reclaim the key" });
            return;
          default:
            assertNever(claim);
        }
      }
      if (!canSend) throw Object.assign(new Error("The request did not obtain an idempotency claim"), { statusCode: 409 });
      const correlationId = req.get("X-Correlation-ID") ?? (req as Request & { id?: string }).id;
      const email = await sendEmail(user.sub, req.body, { correlationId });
      if (idempotencyKey) await completeSendIdempotency(user.sub, idempotencyKey, email.id, 201, email);
      res.status(201).json(email);
    } catch (err: unknown) {
      const error = err as Error & { statusCode?: number };
      if (idempotencyKey && canSend) await failSendIdempotency(user.sub, idempotencyKey, error.statusCode ?? 500, { error: error.statusCode && error.statusCode < 500 ? error.message : "Internal server error" });
      sendEmailControllerError(res, err);
    }
  });

  // PATCH /emails/:id/draft
  router.patch("/:id/draft", requireAuth, async (req: Request, res) => {
    const user = (req as AuthenticatedRequest).user;
    const id = req.params["id"] as string;

    const { sendNow = false, ...draftData } = req.body as SendEmailDto & {
      sendNow?: boolean;
    };

    try {
      const correlationId = req.get("X-Correlation-ID") ?? (req as Request & { id?: string }).id;
      const email = await updateDraft(user.sub, id, draftData, sendNow === true, { correlationId });
      res.json(email);
    } catch (err: unknown) {
      sendEmailControllerError(res, err);
    }
  });

  // POST /emails/:id/cancel - cancel an undo-send or scheduled message
  router.post("/:id/cancel", requireAuth, async (req: Request, res) => {
    const user = (req as AuthenticatedRequest).user;
    const id = req.params["id"] as string;

    try {
      const email = await cancelEmailSend(user.sub, id);
      res.json(email);
    } catch (err: unknown) {
      sendEmailControllerError(res, err);
    }
  });

  // PATCH /emails/:id/snooze
  router.patch("/:id/snooze", requireAuth, async (req: Request, res) => {
    const user = (req as AuthenticatedRequest).user;
    try {
      const email = await snoozeEmail(user.sub, req.params["id"] as string, req.body?.until);
      res.json(email);
    } catch (err: unknown) {
      sendEmailControllerError(res, err);
    }
  });

  // DELETE /emails/:id/snooze
  router.delete("/:id/snooze", requireAuth, async (req: Request, res) => {
    const user = (req as AuthenticatedRequest).user;
    try {
      const email = await unsnoozeEmail(user.sub, req.params["id"] as string);
      res.json(email);
    } catch (err: unknown) {
      sendEmailControllerError(res, err);
    }
  });

  // GET /emails/:id
  router.get("/:id", requireAuth, async (req: Request, res) => {
    const user = (req as AuthenticatedRequest).user;
    const id = req.params["id"] as string;

    try {
      const email = await getEmail(user.sub, id);
      res.setHeader("Cache-Control", "no-store");
      res.json(email);
    } catch (err: unknown) {
      sendEmailControllerError(res, err);
    }
  });

  // DELETE /emails/:id
  router.delete("/:id", requireAuth, async (req: Request, res) => {
    const user = (req as AuthenticatedRequest).user;
    const id = req.params["id"] as string;

    try {
      await trashEmail(user.sub, id);
      res.status(204).end();
    } catch (err: unknown) {
      sendEmailControllerError(res, err);
    }
  });

  // DELETE /emails/:id/permanent
  router.delete("/:id/permanent", requireAuth, async (req: Request, res) => {
    const user = (req as AuthenticatedRequest).user;
    const id = req.params["id"] as string;

    try {
      await deleteEmailPermanent(user.sub, id);
      res.status(204).end();
    } catch (err: unknown) {
      sendEmailControllerError(res, err);
    }
  });

  // PATCH /emails/:id/read
  router.patch("/:id/read", requireAuth, async (req: Request, res) => {
    const user = (req as AuthenticatedRequest).user;
    const id = req.params["id"] as string;
    const { isRead } = req.body as { isRead: boolean };

    try {
      const email = await markEmailRead(user.sub, id, isRead);
      res.json(email);
    } catch (err: unknown) {
      sendEmailControllerError(res, err);
    }
  });

  // PATCH /emails/:id/star
  router.patch("/:id/star", requireAuth, async (req: Request, res) => {
    const user = (req as AuthenticatedRequest).user;
    const id = req.params["id"] as string;

    try {
      const desiredIsStarred = req.body?.isStarred;
      const email = await toggleEmailStar(user.sub, id, typeof desiredIsStarred === "boolean" ? desiredIsStarred : undefined);
      res.json(email);
    } catch (err: unknown) {
      sendEmailControllerError(res, err);
    }
  });

  // PATCH /emails/:id/move
  router.patch("/:id/move", requireAuth, async (req: Request, res) => {
    const user = (req as AuthenticatedRequest).user;
    const id = req.params["id"] as string;

    const { folder, customFolderId = null } = req.body as {
      folder: EmailFolder;
      customFolderId?: string | null;
    };

    try {
      const email = await moveEmail(user.sub, id, folder, customFolderId);

      res.json(email);
    } catch (err: unknown) {
      sendEmailControllerError(res, err);
    }
  });

  // PATCH /emails/:id/restore
  router.patch("/:id/restore", requireAuth, async (req: Request, res) => {
    const user = (req as AuthenticatedRequest).user;
    const id = req.params["id"] as string;

    try {
      const email = await moveEmail(user.sub, id, "inbox", null);

      res.json(email);
    } catch (err: unknown) {
      sendEmailControllerError(res, err);
    }
  });

  return router;
}
