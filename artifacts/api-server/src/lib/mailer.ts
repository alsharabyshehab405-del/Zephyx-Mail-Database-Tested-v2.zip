/**
 * Zephyx Mail mail delivery abstraction.
 *
 * Selection:
 *   NODE_ENV=test  -> FakeMailer (in memory)
 *   SMTP configured -> Nodemailer transport
 *   otherwise       -> NoopMailer (warns without leaking recipient/token)
 *
 * Required SMTP environment variables:
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_FROM, APP_BASE_URL
 * Optional authentication pair:
 *   SMTP_USER, SMTP_PASS
 */

import { createRequire } from "node:module";
import { logger } from "./logger.js";

const localRequire = createRequire(import.meta.url);

export interface Mailer {
  sendEmailVerification(to: string, firstName: string, rawToken: string): Promise<void>;
  sendPasswordReset(to: string, firstName: string, rawToken: string): Promise<void>;
  sendMessage(options: OutboundMessage, signal?: AbortSignal): Promise<void>;
}

export type OutboundAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export type OutboundMessage = {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  headers?: Record<string, string>;
  attachments?: OutboundAttachment[];
};

type MailOptions = OutboundMessage & {
  from: string;
  signal?: AbortSignal;
};

type TransporterLike = {
  sendMail(options: MailOptions): Promise<unknown>;
};

type NodemailerLike = {
  createTransport(options: Record<string, unknown>): TransporterLike;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character] ?? character;
  });
}

function buildActionUrl(pathname: string, rawToken: string): string {
  const deploymentDomain = process.env["REPLIT_DOMAINS"]?.split(",")[0]?.trim();
  const deploymentBase = deploymentDomain
    ? /^https?:\/\//i.test(deploymentDomain)
      ? deploymentDomain
      : `https://${deploymentDomain}`
    : "";
  const configuredBase =
    process.env["REPLIT_DEPLOYMENT"] === "1" && deploymentBase
      ? deploymentBase
      : process.env["APP_BASE_URL"]?.trim() || "http://localhost:5173";
  let url: URL;
  try {
    url = new URL(pathname, configuredBase.endsWith("/") ? configuredBase : `${configuredBase}/`);
  } catch {
    logger.warn("APP_BASE_URL is invalid; using the local development URL for mail links");
    url = new URL(pathname, "http://localhost:5173/");
  }
  url.searchParams.set("token", rawToken);
  return url.toString();
}

function getSmtpConfiguration():
  | {
      host: string;
      port: number;
      secure: boolean;
      from: string;
      user?: string;
      pass?: string;
    }
  | null {
  const host = process.env["SMTP_HOST"]?.trim();
  const from = process.env["SMTP_FROM"]?.trim();
  if (!host || !from) return null;

  const port = Number.parseInt(process.env["SMTP_PORT"] ?? "587", 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    logger.warn("SMTP_PORT is invalid; mail delivery is disabled");
    return null;
  }

  const user = process.env["SMTP_USER"]?.trim();
  const pass = process.env["SMTP_PASS"];
  if (Boolean(user) !== Boolean(pass)) {
    logger.warn("SMTP_USER and SMTP_PASS must either both be set or both be omitted");
    return null;
  }

  return {
    host,
    port,
    secure: process.env["SMTP_SECURE"] === "true",
    from,
    ...(user && pass ? { user, pass } : {}),
  };
}

class SmtpMailer implements Mailer {
  private readonly transporter: TransporterLike;
  private readonly from: string;

  constructor(configuration: NonNullable<ReturnType<typeof getSmtpConfiguration>>) {
    const nodemailer = localRequire("nodemailer") as NodemailerLike;
    this.from = configuration.from;
    this.transporter = nodemailer.createTransport({
      host: configuration.host,
      port: configuration.port,
      secure: configuration.secure,
      ...(configuration.user && configuration.pass
        ? { auth: { user: configuration.user, pass: configuration.pass } }
        : {}),
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }

  async sendEmailVerification(to: string, firstName: string, rawToken: string): Promise<void> {
    const link = buildActionUrl("/verify-email", rawToken);
    const safeName = escapeHtml(firstName);
    await this.transporter.sendMail({
      from: this.from,
      to: [to],
      subject: "Verify your Zephyx Mail email address",
      html: `<p>Hi ${safeName},</p>
<p>Please verify your email address by clicking the link below. The link is valid for 24 hours.</p>
<p><a href="${escapeHtml(link)}">Verify email address</a></p>
<p>If you did not create this account, you can safely ignore this email.</p>`,
      text: `Hi ${firstName},\n\nVerify your email: ${link}\n\nThis link is valid for 24 hours.`,
    });
  }

  async sendPasswordReset(to: string, firstName: string, rawToken: string): Promise<void> {
    const link = buildActionUrl("/reset-password", rawToken);
    const safeName = escapeHtml(firstName);
    await this.transporter.sendMail({
      from: this.from,
      to: [to],
      subject: "Reset your Zephyx Mail password",
      html: `<p>Hi ${safeName},</p>
<p>You requested a password reset. Click the link below. The link is valid for 30 minutes.</p>
<p><a href="${escapeHtml(link)}">Reset password</a></p>
<p>If you did not request this, you can safely ignore this email.</p>`,
      text: `Hi ${firstName},\n\nReset your password: ${link}\n\nThis link expires in 30 minutes.`,
    });
  }
  async sendMessage(options: OutboundMessage, signal?: AbortSignal): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      ...options,
      ...(signal ? { signal } : {}),
    });
  }
}

class NoopMailer implements Mailer {
  async sendEmailVerification(): Promise<void> {
    logger.warn("SMTP is not configured; verification mail was not delivered");
  }

  async sendPasswordReset(): Promise<void> {
    logger.warn("SMTP is not configured; password-reset mail was not delivered");
  }
  async sendMessage(): Promise<void> {
    logger.warn("SMTP is not configured; outgoing email was not delivered");
  }
}

export class FakeMailer implements Mailer {
  private readonly store = new Map<string, string>();

  async sendEmailVerification(to: string, _firstName: string, rawToken: string): Promise<void> {
    this.store.set(`verify:${to.toLowerCase()}`, rawToken);
  }

  async sendPasswordReset(to: string, _firstName: string, rawToken: string): Promise<void> {
    this.store.set(`reset:${to.toLowerCase()}`, rawToken);
  }

  async sendMessage(_options: OutboundMessage): Promise<void> {
    // No external delivery during automated tests.
  }

  getVerifyToken(email: string): string | undefined {
    return this.store.get(`verify:${email.toLowerCase()}`);
  }

  getResetToken(email: string): string | undefined {
    return this.store.get(`reset:${email.toLowerCase()}`);
  }

  clear(): void {
    this.store.clear();
  }
}

let fakeMailer: FakeMailer | null = null;
let mailer: Mailer | null = null;

export function getMailer(): Mailer {
  if (process.env["NODE_ENV"] === "test") {
    fakeMailer ??= new FakeMailer();
    return fakeMailer;
  }

  if (mailer) return mailer;

  const configuration = getSmtpConfiguration();
  if (!configuration) {
    mailer = new NoopMailer();
    return mailer;
  }

  try {
    mailer = new SmtpMailer(configuration);
  } catch (err: unknown) {
    logger.error({ err }, "SMTP transport could not be initialized; mail delivery is disabled");
    mailer = new NoopMailer();
  }
  return mailer;
}

export function getFakeMailer(): FakeMailer {
  fakeMailer ??= new FakeMailer();
  return fakeMailer;
}
