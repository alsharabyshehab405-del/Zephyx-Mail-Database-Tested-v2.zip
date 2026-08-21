import { createHash, randomUUID } from "node:crypto";
import jwt, { type JwtPayload as JsonWebTokenPayload } from "jsonwebtoken";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  emailsTable,
  gmailConnectionsTable,
  type EmailAddress,
  type EmailAttachment,
  type GmailConnection,
} from "@workspace/db";
import { autoCategorizeIncomingEmail } from "../ai/ai.service.js";
import {
  findSubjectThreadParent,
  type ThreadCandidate,
} from "../emails/email-threading.js";
import { logger } from "../../lib/logger.js";
import {
  cleanupAttachmentCandidates,
  createPersistentAttachment,
  MAX_ATTACHMENT_SIZE,
  MAX_TOTAL_ATTACHMENT_SIZE,
} from "../emails/attachments.service.js";
import {
  decryptGmailToken,
  deriveGmailOAuthStateSecret,
  encryptGmailToken,
} from "./gmail.crypto.js";
import type {
  GmailHeader,
  GmailHistoryListResponse,
  GmailMessage,
  GmailMessageListResponse,
  GmailMessagePart,
  GmailProfile,
  GoogleTokenResponse,
} from "./gmail.types.js";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.modify";
const GOOGLE_AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API_ROOT = "https://gmail.googleapis.com/gmail/v1/users/me";
const OAUTH_STATE_ISSUER = "novamail";
const OAUTH_STATE_AUDIENCE = "gmail-oauth";
const activeSyncUsers = new Set<string>();

class ExternalApiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly upstreamStatus?: number,
  ) {
    super(message);
  }
}

type GmailConfiguration = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

type OAuthStatePayload = {
  sub: string;
  purpose: "gmail-connect";
};

type GmailAttachmentPartDescriptor = {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string | null;
  inlineData: string | null;
};

type GmailAttachmentResponse = {
  data?: string;
  size?: number;
};

type ParsedGmailMessage = {
  gmailMessageId: string;
  gmailThreadId: string | null;
  gmailHistoryId: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  subject: string;
  fromEmail: string;
  fromName: string | null;
  toAddresses: EmailAddress[];
  ccAddresses: EmailAddress[];
  bccAddresses: EmailAddress[];
  bodyText: string;
  bodyHtml: string;
  labels: string[];
  isRead: boolean;
  isStarred: boolean;
  attachmentParts: GmailAttachmentPartDescriptor[];
  sentAt: Date;
};

type GmailBackedFolder =
  | "inbox"
  | "sent"
  | "drafts"
  | "archive"
  | "trash"
  | "spam";

function folderFromGmailLabels(labels: string[]): GmailBackedFolder {
  const current = new Set(labels);

  if (current.has("TRASH")) return "trash";
  if (current.has("SPAM")) return "spam";
  if (current.has("DRAFT")) return "drafts";
  if (current.has("INBOX")) return "inbox";
  if (current.has("SENT")) return "sent";

  return "archive";
}

function configurationValue(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw Object.assign(new Error(`Gmail integration is not configured: ${name} is missing`), {
      statusCode: 503,
    });
  }

  return value;
}

function getGmailConfiguration(): GmailConfiguration {
  return {
    clientId: configurationValue("GOOGLE_CLIENT_ID"),
    clientSecret: configurationValue("GOOGLE_CLIENT_SECRET"),
    redirectUri: configurationValue("GOOGLE_REDIRECT_URI"),
  };
}

export function isGmailConfigured(): boolean {
  try {
    getGmailConfiguration();
    deriveGmailOAuthStateSecret();
    return true;
  } catch {
    return false;
  }
}

function getPositiveInteger(name: string, fallback: number, maximum: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  const value = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  return Math.min(value, maximum);
}

function createOAuthState(userId: string): string {
  return jwt.sign(
    {
      purpose: "gmail-connect",
      nonce: randomUUID(),
    },
    deriveGmailOAuthStateSecret(),
    {
      subject: userId,
      issuer: OAUTH_STATE_ISSUER,
      audience: OAUTH_STATE_AUDIENCE,
      expiresIn: "10m",
      algorithm: "HS256",
      jwtid: randomUUID(),
    },
  );
}

function verifyOAuthState(state: string): OAuthStatePayload {
  let decoded: string | JsonWebTokenPayload;

  try {
    decoded = jwt.verify(state, deriveGmailOAuthStateSecret(), {
      issuer: OAUTH_STATE_ISSUER,
      audience: OAUTH_STATE_AUDIENCE,
      algorithms: ["HS256"],
    });
  } catch {
    throw Object.assign(new Error("The Gmail connection request is invalid or expired"), {
      statusCode: 400,
    });
  }

  if (
    typeof decoded === "string" ||
    typeof decoded.sub !== "string" ||
    decoded.purpose !== "gmail-connect"
  ) {
    throw Object.assign(new Error("The Gmail connection request is invalid"), {
      statusCode: 400,
    });
  }

  return {
    sub: decoded.sub,
    purpose: "gmail-connect",
  };
}

export function createGmailAuthorizationUrl(userId: string): string {
  const config = getGmailConfiguration();
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPE,
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state: createOAuthState(userId),
  });

  return `${GOOGLE_AUTHORIZATION_URL}?${params.toString()}`;
}

async function readJsonResponse<T>(response: Response, fallback: string): Promise<T> {
  let data: unknown;

  try {
    data = await response.json();
  } catch {
    if (!response.ok) {
      throw new ExternalApiError(fallback, 502, response.status);
    }
    throw new ExternalApiError("Google returned an invalid response", 502, response.status);
  }

  if (!response.ok) {
    const candidate = data as {
      error?: string | { message?: string; status?: string };
      error_description?: string;
    };
    const message =
      candidate.error_description ||
      (typeof candidate.error === "string" ? candidate.error : candidate.error?.message) ||
      fallback;

    throw new ExternalApiError(message, response.status === 401 ? 401 : 502, response.status);
  }

  return data as T;
}

async function exchangeAuthorizationCode(code: string): Promise<GoogleTokenResponse> {
  const config = getGmailConfiguration();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
    }),
  });

  return readJsonResponse<GoogleTokenResponse>(
    response,
    "Google rejected the Gmail authorization code",
  );
}

async function refreshGoogleAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const config = getGmailConfiguration();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  try {
    return await readJsonResponse<GoogleTokenResponse>(
      response,
      "Google could not refresh Gmail authorization",
    );
  } catch (error) {
    if (error instanceof ExternalApiError && error.upstreamStatus === 400) {
      throw Object.assign(new Error("Gmail authorization expired. Reconnect Gmail."), {
        statusCode: 401,
      });
    }
    throw error;
  }
}

async function gmailApiRequest<T>(
  path: string,
  accessToken: string,
  params?: URLSearchParams,
): Promise<T> {
  const url = new URL(`${GMAIL_API_ROOT}${path}`);
  if (params) {
    url.search = params.toString();
  }

  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
    },
  });

  return readJsonResponse<T>(response, "Gmail API request failed");
}


type GmailWatchResponse = {
  historyId: string;
  expiration: string;
};

async function startGmailWatch(
  connection: GmailConnection,
): Promise<GmailWatchResponse> {
  async function doWatch(accessToken: string): Promise<GmailWatchResponse> {
    const response = await fetch(`${GMAIL_API_ROOT}/watch`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        topicName:
          "projects/novamail-504404/topics/novamail-gmail-events",
      }),
    });
    return readJsonResponse<GmailWatchResponse>(
      response,
      "Google could not start Gmail push notifications",
    );
  }

  let credentials = await ensureFreshAccessToken(connection);
  try {
    return await doWatch(credentials.accessToken);
  } catch (error) {
    if (!(error instanceof ExternalApiError) || error.upstreamStatus !== 401) throw error;
    credentials = await ensureFreshAccessToken(credentials.connection, true);
    return await doWatch(credentials.accessToken);
  }
}

function tokenExpiry(expiresIn: number | undefined): Date | null {
  if (!expiresIn || !Number.isFinite(expiresIn)) {
    return null;
  }

  return new Date(Date.now() + Math.max(0, expiresIn - 30) * 1000);
}

async function getConnection(userId: string): Promise<GmailConnection | null> {
  const [connection] = await db
    .select()
    .from(gmailConnectionsTable)
    .where(eq(gmailConnectionsTable.userId, userId))
    .limit(1);

  return connection ?? null;
}

function databaseSchemaMissing(error: unknown): boolean {
  const candidate = error as {
    code?: string;
    cause?: { code?: string };
  };
  const code = candidate.code ?? candidate.cause?.code;
  return code === "42P01" || code === "42703";
}

function migrationRequiredError(): Error & { statusCode: number } {
  return Object.assign(new Error("Gmail database migration has not been applied"), {
    statusCode: 503,
  });
}

export async function getGmailStatus(userId: string) {
  if (!isGmailConfigured()) {
    return {
      configured: false,
      connected: false,
      migrationRequired: false,
      email: null,
      lastSyncedAt: null,
    };
  }

  try {
    const connection = await getConnection(userId);
    return {
      configured: true,
      connected: Boolean(connection),
      migrationRequired: false,
      email: connection?.gmailEmail ?? null,
      lastSyncedAt: connection?.lastSyncedAt?.toISOString() ?? null,
    };
  } catch (error) {
    if (databaseSchemaMissing(error)) {
      return {
        configured: true,
        connected: false,
        migrationRequired: true,
        email: null,
        lastSyncedAt: null,
      };
    }
    throw error;
  }
}

async function ensureFreshAccessToken(
  connection: GmailConnection,
  forceRefresh = false,
): Promise<{ connection: GmailConnection; accessToken: string }> {
  const accessToken = decryptGmailToken(connection.encryptedAccessToken);
  const expiresSoon =
    connection.tokenExpiry !== null && connection.tokenExpiry.getTime() <= Date.now() + 60_000;

  if (!forceRefresh && !expiresSoon) {
    return { connection, accessToken };
  }

  if (!connection.encryptedRefreshToken) {
    throw Object.assign(new Error("Gmail access expired. Reconnect Gmail."), {
      statusCode: 401,
    });
  }

  const refreshToken = decryptGmailToken(connection.encryptedRefreshToken);
  const refreshed = await refreshGoogleAccessToken(refreshToken);

  if (!refreshed.access_token) {
    throw new ExternalApiError("Google did not return a Gmail access token", 502);
  }

  const [updated] = await db
    .update(gmailConnectionsTable)
    .set({
      encryptedAccessToken: encryptGmailToken(refreshed.access_token),
      tokenExpiry: tokenExpiry(refreshed.expires_in),
      scope: refreshed.scope ?? connection.scope,
      tokenType: refreshed.token_type ?? connection.tokenType,
      updatedAt: new Date(),
    })
    .where(eq(gmailConnectionsTable.userId, connection.userId))
    .returning();

  if (!updated) {
    throw Object.assign(new Error("Gmail connection could not be updated"), {
      statusCode: 500,
    });
  }

  return { connection: updated, accessToken: refreshed.access_token };
}

async function requestWithConnection<T>(
  connection: GmailConnection,
  path: string,
  params?: URLSearchParams,
): Promise<{ data: T; connection: GmailConnection }> {
  let credentials = await ensureFreshAccessToken(connection);

  try {
    return {
      data: await gmailApiRequest<T>(path, credentials.accessToken, params),
      connection: credentials.connection,
    };
  } catch (error) {
    if (!(error instanceof ExternalApiError) || error.upstreamStatus !== 401) {
      throw error;
    }

    credentials = await ensureFreshAccessToken(credentials.connection, true);
    return {
      data: await gmailApiRequest<T>(path, credentials.accessToken, params),
      connection: credentials.connection,
    };
  }
}


async function gmailWriteRequest<T>(
  userId: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const connection = await getConnection(userId);

  if (!connection) {
    throw Object.assign(new Error("Gmail is not connected"), {
      statusCode: 401,
    });
  }

  let credentials = await ensureFreshAccessToken(connection);

  async function perform(accessToken: string): Promise<T> {
    const init: RequestInit = {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json",
        "content-type": "application/json",
      },
    };

    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    const response = await fetch(`${GMAIL_API_ROOT}${path}`, init);

    return readJsonResponse<T>(
      response,
      "Gmail write request failed",
    );
  }

  try {
    return await perform(credentials.accessToken);
  } catch (error) {
    if (
      !(error instanceof ExternalApiError) ||
      error.upstreamStatus !== 401
    ) {
      throw error;
    }

    credentials = await ensureFreshAccessToken(
      credentials.connection,
      true,
    );

    return perform(credentials.accessToken);
  }
}

export async function modifyGmailMessageLabels(
  userId: string,
  gmailMessageId: string,
  addLabelIds: string[] = [],
  removeLabelIds: string[] = [],
): Promise<void> {
  await gmailWriteRequest(
    userId,
    `/messages/${encodeURIComponent(gmailMessageId)}/modify`,
    {
      addLabelIds,
      removeLabelIds,
    },
  );
}

export async function trashGmailMessage(
  userId: string,
  gmailMessageId: string,
): Promise<void> {
  await gmailWriteRequest(
    userId,
    `/messages/${encodeURIComponent(gmailMessageId)}/trash`,
  );
}

export async function untrashGmailMessage(
  userId: string,
  gmailMessageId: string,
): Promise<void> {
  await gmailWriteRequest(
    userId,
    `/messages/${encodeURIComponent(gmailMessageId)}/untrash`,
  );
}

export async function completeGmailConnection(code: string, state: string) {
  const oauthState = verifyOAuthState(state);
  const tokens = await exchangeAuthorizationCode(code);

  if (!tokens.access_token) {
    throw new ExternalApiError("Google did not return a Gmail access token", 502);
  }

  const profile = await gmailApiRequest<GmailProfile>("/profile", tokens.access_token);
  const gmailEmail = profile.emailAddress?.trim().toLowerCase();

  if (!gmailEmail) {
    throw new ExternalApiError("Google did not return the Gmail account address", 502);
  }

  try {
    const existing = await getConnection(oauthState.sub);
    const sameMailbox = existing?.gmailEmail.toLowerCase() === gmailEmail;
    const encryptedRefreshToken = tokens.refresh_token
      ? encryptGmailToken(tokens.refresh_token)
      : sameMailbox
        ? existing?.encryptedRefreshToken ?? null
        : null;

    const values = {
      gmailEmail,
      encryptedAccessToken: encryptGmailToken(tokens.access_token),
      encryptedRefreshToken,
      tokenExpiry: tokenExpiry(tokens.expires_in),
      scope: tokens.scope ?? GMAIL_SCOPE,
      tokenType: tokens.token_type ?? "Bearer",
      lastHistoryId: sameMailbox ? existing?.lastHistoryId ?? null : null,
      lastSyncedAt: sameMailbox ? existing?.lastSyncedAt ?? null : null,
      updatedAt: new Date(),
    };

    if (existing) {
      await db
        .update(gmailConnectionsTable)
        .set(values)
        .where(eq(gmailConnectionsTable.userId, oauthState.sub));
    } else {
      await db.insert(gmailConnectionsTable).values({
        userId: oauthState.sub,
        ...values,
      });
    }

    const savedConnection = await getConnection(oauthState.sub);
    if (!savedConnection) {
      throw Object.assign(new Error("Gmail connection could not be saved"), { statusCode: 500 });
    }
    await startGmailWatch(savedConnection);

    return {
      userId: oauthState.sub,
      gmailEmail,
      hasRefreshToken: Boolean(encryptedRefreshToken),
    };
  } catch (error) {
    if (databaseSchemaMissing(error)) {
      throw migrationRequiredError();
    }
    throw error;
  }
}

export async function disconnectGmail(userId: string): Promise<void> {
  try {
    await db.delete(gmailConnectionsTable).where(eq(gmailConnectionsTable.userId, userId));
  } catch (error) {
    if (databaseSchemaMissing(error)) {
      throw migrationRequiredError();
    }
    throw error;
  }
}

function decodeMimeWords(value: string): string {
  return value.replace(/=\?([^?]+)\?([bqBQ])\?([^?]*)\?=/g, (_match, charset, encoding, data) => {
    try {
      let bytes: Buffer;
      if (String(encoding).toUpperCase() === "B") {
        bytes = Buffer.from(String(data), "base64");
      } else {
        const quoted = String(data)
          .replace(/_/g, " ")
          .replace(/=([0-9A-F]{2})/gi, (_hexMatch, hex) =>
            String.fromCharCode(Number.parseInt(hex, 16)),
          );
        bytes = Buffer.from(quoted, "binary");
      }

      const normalizedCharset = String(charset).toLowerCase();
      if (normalizedCharset === "utf-8" || normalizedCharset === "utf8") {
        return bytes.toString("utf8");
      }
      if (normalizedCharset === "iso-8859-1" || normalizedCharset === "latin1") {
        return bytes.toString("latin1");
      }
      return bytes.toString("utf8");
    } catch {
      return _match;
    }
  });
}

function splitAddressHeader(value: string): string[] {
  const entries: string[] = [];
  let current = "";
  let quoted = false;
  let angleDepth = 0;

  for (const character of value) {
    if (character === '"') {
      quoted = !quoted;
    } else if (!quoted && character === "<") {
      angleDepth += 1;
    } else if (!quoted && character === ">") {
      angleDepth = Math.max(0, angleDepth - 1);
    }

    if (character === "," && !quoted && angleDepth === 0) {
      if (current.trim()) entries.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }

  if (current.trim()) entries.push(current.trim());
  return entries;
}

function parseAddressList(value: string | undefined): EmailAddress[] {
  if (!value) return [];

  const seen = new Set<string>();
  const addresses: EmailAddress[] = [];

  for (const rawEntry of splitAddressHeader(decodeMimeWords(value))) {
    const angleMatch = rawEntry.match(/^(.*)<([^<>]+)>\s*$/);
    const emailCandidate = (angleMatch?.[2] ?? rawEntry).trim().replace(/^mailto:/i, "");
    const emailMatch = emailCandidate.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+/i);

    if (!emailMatch) continue;

    const email = emailMatch[0].toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);

    const rawName = angleMatch?.[1]?.trim().replace(/^"|"$/g, "");
    addresses.push({
      email,
      name: rawName ? decodeMimeWords(rawName) : null,
    });
  }

  return addresses;
}

function getHeader(headers: GmailHeader[] | undefined, name: string): string | undefined {
  return headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value;
}

function decodeBase64Url(value: string): string {
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return "";
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_match, decimal) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function htmlToText(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<\s*(script|style|head|iframe|object|svg)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
      .replace(/<\s*br\s*\/?\s*>/gi, "\n")
      .replace(/<\s*\/\s*(p|div|li|tr|h[1-6])\s*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\r/g, "")
    .replace(/[\t ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[\t ]{2,}/g, " ")
    .trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function collectBodies(part: GmailMessagePart | undefined, bodies: { plain: string[]; html: string[] }) {
  if (!part) return;

  const disposition = getHeader(part.headers, "Content-Disposition")?.toLowerCase() ?? "";
  const isAttachment = Boolean(part.filename?.trim()) || disposition.includes("attachment");
  const data = part.body?.data ? decodeBase64Url(part.body.data) : "";
  const mimeType = part.mimeType?.toLowerCase() ?? "";

  if (!isAttachment && data) {
    if (mimeType === "text/plain") bodies.plain.push(data);
    if (mimeType === "text/html") bodies.html.push(data);
  }

  for (const child of part.parts ?? []) {
    collectBodies(child, bodies);
  }
}

function collectAttachmentParts(
  part: GmailMessagePart | undefined,
  attachments: GmailAttachmentPartDescriptor[],
): void {
  if (!part) return;

  const disposition = getHeader(part.headers, "Content-Disposition")?.toLowerCase() ?? "";
  const filename = decodeMimeWords(part.filename?.trim() || "");
  const isAttachment =
    Boolean(filename) ||
    disposition.includes("attachment") ||
    (disposition.includes("inline") && Boolean(part.body?.attachmentId));

  if (isAttachment && (part.body?.attachmentId || part.body?.data)) {
    attachments.push({
      filename: filename || `gmail-attachment-${attachments.length + 1}`,
      mimeType: part.mimeType || "application/octet-stream",
      size: Math.max(0, part.body?.size ?? 0),
      attachmentId: part.body?.attachmentId ?? null,
      inlineData: part.body?.data ?? null,
    });
  }

  for (const child of part.parts ?? []) {
    collectAttachmentParts(child, attachments);
  }
}

function parseMessageDate(message: GmailMessage, dateHeader: string | undefined): Date {
  const internalDate = Number(message.internalDate);
  if (Number.isFinite(internalDate) && internalDate > 0) {
    return new Date(internalDate);
  }

  if (dateHeader) {
    const parsed = new Date(dateHeader);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return new Date();
}

function parseGmailMessage(message: GmailMessage, gmailEmail: string): ParsedGmailMessage {
  if (!message.id) {
    throw new ExternalApiError("Gmail returned a message without an id", 502);
  }

  const headers = message.payload?.headers;
  const from = parseAddressList(getHeader(headers, "From"))[0] ?? {
    email: "unknown@unknown.invalid",
    name: null,
  };
  const bodies = { plain: [] as string[], html: [] as string[] };
  const attachmentParts: GmailAttachmentPartDescriptor[] = [];
  collectBodies(message.payload, bodies);
  collectAttachmentParts(message.payload, attachmentParts);

  const plainBody = bodies.plain.join("\n\n").trim();
  const htmlBodyText = htmlToText(bodies.html.join("\n"));
  const bodyText = plainBody || htmlBodyText || message.snippet?.trim() || "";
  const subject = decodeMimeWords(getHeader(headers, "Subject")?.trim() || "(No subject)");
  const sentAt = parseMessageDate(message, getHeader(headers, "Date"));
  const labelIds = message.labelIds ?? [];
  const messageId = getHeader(headers, "Message-ID")?.trim() || null;
  const inReplyTo = getHeader(headers, "In-Reply-To")?.trim() || null;
  const rawReferences = getHeader(headers, "References") ?? "";
  const references = rawReferences.match(/<[^>]+>/g) ?? rawReferences.split(/\s+/).filter(Boolean);

  const toAddresses = parseAddressList(getHeader(headers, "To"));
  if (toAddresses.length === 0) {
    toAddresses.push({ email: gmailEmail, name: null });
  }

  return {
    gmailMessageId: message.id,
    gmailThreadId: message.threadId ?? null,
    gmailHistoryId: message.historyId ?? null,
    messageId,
    inReplyTo,
    references,
    subject,
    fromEmail: from.email,
    fromName: from.name ?? null,
    toAddresses,
    ccAddresses: parseAddressList(getHeader(headers, "Cc")),
    bccAddresses: parseAddressList(getHeader(headers, "Bcc")),
    bodyText,
    bodyHtml: `<p>${escapeHtml(bodyText).replace(/\n/g, "<br/>")}</p>`,
    labels: labelIds,
    isRead: !labelIds.includes("UNREAD"),
    isStarred: labelIds.includes("STARRED"),
    attachmentParts,
    sentAt,
  };
}

async function listInitialMessageIds(
  connection: GmailConnection,
): Promise<{ ids: string[]; connection: GmailConnection }> {
  const maximum = getPositiveInteger("GMAIL_INITIAL_SYNC_MAX", 100, 500);
  const ids: string[] = [];
  let pageToken: string | undefined;
  let currentConnection = connection;

  while (ids.length < maximum) {
    const params = new URLSearchParams({
      maxResults: String(Math.min(500, maximum - ids.length)),
    });
    if (pageToken) params.set("pageToken", pageToken);

    const response = await requestWithConnection<GmailMessageListResponse>(
      currentConnection,
      "/messages",
      params,
    );
    currentConnection = response.connection;

    for (const message of response.data.messages ?? []) {
      if (message.id) ids.push(message.id);
      if (ids.length >= maximum) break;
    }

    pageToken = response.data.nextPageToken;
    if (!pageToken) break;
  }

  return { ids: Array.from(new Set(ids)), connection: currentConnection };
}

async function listIncrementalMessageIds(
  connection: GmailConnection,
): Promise<{ ids: string[]; historyId: string | null; connection: GmailConnection; fullSync: boolean }> {
  if (!connection.lastHistoryId) {
    const initial = await listInitialMessageIds(connection);
    return { ids: initial.ids, historyId: null, connection: initial.connection, fullSync: true };
  }

  const ids = new Set<string>();
  let pageToken: string | undefined;
  let currentConnection = connection;
  let latestHistoryId: string | null = null;

  try {
    do {
      const params = new URLSearchParams({
        startHistoryId: connection.lastHistoryId,
        maxResults: "500",
      });
      if (pageToken) params.set("pageToken", pageToken);

      const response = await requestWithConnection<GmailHistoryListResponse>(
        currentConnection,
        "/history",
        params,
      );
      currentConnection = response.connection;
      latestHistoryId = response.data.historyId ?? latestHistoryId;

      for (const history of response.data.history ?? []) {
      const historyRecord = history as typeof history & {
        labelsAdded?: Array<{
          message?: { id?: string | null } | null;
        }>;
        labelsRemoved?: Array<{
          message?: { id?: string | null } | null;
        }>;
      };

      for (const added of history.messagesAdded ?? []) {
        if (added.message?.id) {
          ids.add(added.message.id);
        }
      }

      for (const changed of historyRecord.labelsAdded ?? []) {
        if (changed.message?.id) {
          ids.add(changed.message.id);
        }
      }

      for (const changed of historyRecord.labelsRemoved ?? []) {
        if (changed.message?.id) {
          ids.add(changed.message.id);
        }
      }
    }

      pageToken = response.data.nextPageToken;
    } while (pageToken);

    return {
      ids: Array.from(ids),
      historyId: latestHistoryId,
      connection: currentConnection,
      fullSync: false,
    };
  } catch (error) {
    if (error instanceof ExternalApiError && error.upstreamStatus === 404) {
      const initial = await listInitialMessageIds(currentConnection);
      return { ids: initial.ids, historyId: null, connection: initial.connection, fullSync: true };
    }
    throw error;
  }
}

async function fetchMessageDetails(
  connection: GmailConnection,
  ids: string[],
): Promise<{ messages: GmailMessage[]; connection: GmailConnection }> {
  let currentConnection = connection;
  const messages: GmailMessage[] = [];
  const concurrency = 5;

  for (let start = 0; start < ids.length; start += concurrency) {
    const batch = ids.slice(start, start + concurrency);

    const results = await Promise.all(
      batch.map(async (id) => {
        try {
          const { data, connection: updated } = await requestWithConnection<GmailMessage>(
            currentConnection,
            `/messages/${encodeURIComponent(id)}`,
            new URLSearchParams({ format: "full" }),
          );
          currentConnection = updated;
          return data;
        } catch (error) {
          if (error instanceof ExternalApiError && error.upstreamStatus === 404) {
            return null;
          }
          throw error;
        }
      }),
    );

    messages.push(...results.filter((message): message is GmailMessage => message !== null));
  }

  return { messages, connection: currentConnection };
}

async function getRecentThreadCandidates(userId: string): Promise<ThreadCandidate[]> {
  const rows = await db
    .select({
      id: emailsTable.id,
      subject: emailsTable.subject,
      threadId: emailsTable.threadId,
      replyToId: emailsTable.replyToId,
      fromEmail: emailsTable.fromEmail,
      toAddresses: emailsTable.toAddresses,
      isDraft: emailsTable.isDraft,
      createdAt: emailsTable.createdAt,
    })
    .from(emailsTable)
    .where(eq(emailsTable.userId, userId))
    .orderBy(desc(emailsTable.createdAt))
    .limit(200);

  return rows;
}

async function findLatestGmailThreadMessage(userId: string, gmailThreadId: string) {
  const [row] = await db
    .select({
      id: emailsTable.id,
      threadId: emailsTable.threadId,
    })
    .from(emailsTable)
    .where(
      and(
        eq(emailsTable.userId, userId),
        eq(emailsTable.gmailThreadId, gmailThreadId),
      ),
    )
    .orderBy(desc(emailsTable.createdAt))
    .limit(1);

  return row ?? null;
}

async function storeGmailAttachments(
  userId: string,
  message: ParsedGmailMessage,
  connection: GmailConnection,
): Promise<{ attachments: EmailAttachment[]; connection: GmailConnection }> {
  let currentConnection = connection;
  const attachments: EmailAttachment[] = [];
  const seen = new Set<string>();
  let totalSize = 0;

  try {
    for (const part of message.attachmentParts) {
      const dedupeKey = [part.attachmentId ?? "inline", part.filename, part.size].join(":");
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      if (part.size > MAX_ATTACHMENT_SIZE) {
        logger.warn(
          { attachmentSize: part.size },
          "A Gmail attachment exceeded Zephyx Mail's 25 MB attachment limit and was skipped",
        );
        continue;
      }

      let encoded = part.inlineData;

      if (!encoded && part.attachmentId) {
        const response = await requestWithConnection<GmailAttachmentResponse>(
          currentConnection,
          `/messages/${encodeURIComponent(message.gmailMessageId)}/attachments/${encodeURIComponent(part.attachmentId)}`,
        );
        currentConnection = response.connection;
        encoded = response.data.data ?? null;
      }

      if (!encoded) continue;

      const contents = Buffer.from(encoded, "base64url");
      if (contents.length === 0) continue;

      if (contents.length > MAX_ATTACHMENT_SIZE) {
        logger.warn(
          { attachmentSize: contents.length },
          "A Gmail attachment exceeded Zephyx Mail's 25 MB attachment limit and was skipped",
        );
        continue;
      }

      if (totalSize + contents.length > MAX_TOTAL_ATTACHMENT_SIZE) {
        logger.warn(
          { totalSize: totalSize + contents.length },
          "A Gmail message exceeded Zephyx Mail's 50 MB combined attachment limit; remaining attachments were skipped",
        );
        break;
      }

      attachments.push(
        await createPersistentAttachment({
          ownerUserId: userId,
          filename: part.filename,
          mimeType: part.mimeType,
          contents,
        }),
      );
      totalSize += contents.length;
    }

    return { attachments, connection: currentConnection };
  } catch (error) {
    await cleanupAttachmentCandidates(attachments);
    throw error;
  }
}

async function importMessages(
  userId: string,
  gmailEmail: string,
  messages: GmailMessage[],
  connection: GmailConnection,
): Promise<{ imported: number; connection: GmailConnection }> {
  const parsed = messages
    .map((message) => parseGmailMessage(message, gmailEmail))
    .sort((first, second) => first.sentAt.getTime() - second.sentAt.getTime());
  const candidates = await getRecentThreadCandidates(userId);
  let imported = 0;
  let currentConnection = connection;

  for (const message of parsed) {
    const storedAttachments = await storeGmailAttachments(
      userId,
      message,
      currentConnection,
    );
    currentConnection = storedAttachments.connection;
    let threadId = message.gmailThreadId ? `gmail:${message.gmailThreadId}` : null;
    let replyToId: string | null = null;

    if (message.gmailThreadId) {
      const existingThreadMessage = await findLatestGmailThreadMessage(
        userId,
        message.gmailThreadId,
      );
      if (existingThreadMessage) {
        threadId = existingThreadMessage.threadId ?? existingThreadMessage.id;
        replyToId = existingThreadMessage.id;
      }
    }

    if (!replyToId) {
      const subjectParent = findSubjectThreadParent(candidates, {
        subject: message.subject,
        before: message.sentAt,
        participantEmails: [
          message.fromEmail,
          ...message.toAddresses.map((address) => address.email),
          ...message.ccAddresses.map((address) => address.email),
        ],
      });

      if (subjectParent) {
        threadId = subjectParent.threadId ?? subjectParent.id;
        replyToId = subjectParent.id;
      }
    }

    const [inserted] = await db
      .insert(emailsTable)
      .values({
        userId,
        subject: message.subject,
        fromEmail: message.fromEmail,
        fromName: message.fromName,
        toAddresses: message.toAddresses,
        ccAddresses: message.ccAddresses,
        bccAddresses: message.bccAddresses,
        bodyHtml: message.bodyHtml,
        bodyText: message.bodyText,
        folder: folderFromGmailLabels(message.labels),
        isRead: message.isRead,
        isStarred: message.isStarred,
        isDraft: message.labels.includes("DRAFT"),
        attachments: storedAttachments.attachments,
        threadId,
        replyToId,
        messageId: message.messageId,
        inReplyTo: message.inReplyTo,
        references: message.references,
        status: message.labels.includes("DRAFT") ? "draft" : "sent",
        labels: message.labels,
        gmailMessageId: message.gmailMessageId,
        gmailThreadId: message.gmailThreadId,
        gmailHistoryId: message.gmailHistoryId,
        sentAt: message.sentAt,
        createdAt: message.sentAt,
      })
      .onConflictDoNothing({
        target: [emailsTable.userId, emailsTable.gmailMessageId],
      })
      .returning();

    if (inserted) {
      imported += 1;
      void autoCategorizeIncomingEmail(userId, inserted.id).catch(() => undefined);
      candidates.unshift({
        id: inserted.id,
        subject: inserted.subject,
        threadId: inserted.threadId,
        replyToId: inserted.replyToId,
        fromEmail: inserted.fromEmail,
        toAddresses: inserted.toAddresses,
        isDraft: inserted.isDraft,
        createdAt: inserted.createdAt,
      });
    } else {
        // Message already exists: refresh Gmail-owned mutable state.
        await db
          .update(emailsTable)
          .set({
            folder: folderFromGmailLabels(message.labels),
            labels: message.labels,
            isRead: message.isRead,
            isStarred: message.isStarred,
            isDraft: message.labels.includes("DRAFT"),
            status: message.labels.includes("DRAFT") ? "draft" : "sent",
            messageId: message.messageId,
            inReplyTo: message.inReplyTo,
            references: message.references,
          })
          .where(
            and(
              eq(emailsTable.userId, userId),
              eq(emailsTable.gmailMessageId, message.gmailMessageId),
            ),
          );

        await cleanupAttachmentCandidates(storedAttachments.attachments);
      }
  }

  return { imported, connection: currentConnection };
}

export async function syncGmail(userId: string) {
  if (activeSyncUsers.has(userId)) {
    throw Object.assign(new Error("A Gmail sync is already running"), {
      statusCode: 409,
    });
  }

  activeSyncUsers.add(userId);

  try {
    let connection: GmailConnection | null;
    try {
      connection = await getConnection(userId);
    } catch (error) {
      if (databaseSchemaMissing(error)) throw migrationRequiredError();
      throw error;
    }

    if (!connection) {
      throw Object.assign(new Error("Connect a Gmail account before syncing"), {
        statusCode: 400,
      });
    }

    const listed = await listIncrementalMessageIds(connection);
    connection = listed.connection;

    // History IDs may refer to existing messages whose Gmail labels changed.
    // Always refetch every changed message so read/star/folder/label state stays current.
    const details = await fetchMessageDetails(connection, listed.ids);
    connection = details.connection;
    const importResult = await importMessages(
      userId,
      connection.gmailEmail,
      details.messages,
      connection,
    );
    connection = importResult.connection;

    const profileResponse = await requestWithConnection<GmailProfile>(connection, "/profile");
    connection = profileResponse.connection;
    const latestHistoryId =
      profileResponse.data.historyId ?? listed.historyId ?? connection.lastHistoryId;
    const syncedAt = new Date();

    await db
      .update(gmailConnectionsTable)
      .set({
        lastHistoryId: latestHistoryId,
        lastSyncedAt: syncedAt,
        updatedAt: syncedAt,
      })
      .where(eq(gmailConnectionsTable.userId, userId));

    return {
      imported: importResult.imported,
      checked: listed.ids.length,
      fullSync: listed.fullSync,
      email: connection.gmailEmail,
      lastSyncedAt: syncedAt.toISOString(),
    };
  } catch (error) {
    logger.warn(
      {
        userIdHash: createHash("sha256").update(userId).digest("hex").slice(0, 12),
        errorName: error instanceof Error ? error.name : "unknown",
      },
      "Gmail sync failed",
    );
    throw error;
  } finally {
    activeSyncUsers.delete(userId);
  }
}

// NOVAMAIL_GMAIL_PUBSUB_SYNC_START
export async function syncGmailFromPushNotification(
  emailAddress: string,
) {
  const normalizedEmail = emailAddress.trim().toLowerCase();

  if (!normalizedEmail) {
    return {
      matched: false,
      imported: 0,
    };
  }

  const [connection] = await db
    .select({
      userId: gmailConnectionsTable.userId,
    })
    .from(gmailConnectionsTable)
    .where(eq(gmailConnectionsTable.gmailEmail, normalizedEmail))
    .limit(1);

  if (!connection) {
    return {
      matched: false,
      imported: 0,
    };
  }

  try {
    const result = await syncGmail(connection.userId);

    return {
      matched: true,
      imported: result.imported,
    };
  } catch (error) {
    const candidate = error as Error & { statusCode?: number };

    // توجد مزامنة أخرى تعمل بالفعل؛ نقرّ إشعار Pub/Sub دون تكرارها.
    if (candidate.statusCode === 409) {
      return {
        matched: true,
        imported: 0,
      };
    }

    throw error;
  }
}
// NOVAMAIL_GMAIL_PUBSUB_SYNC_END

