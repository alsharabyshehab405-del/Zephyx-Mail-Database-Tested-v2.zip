export type AttachmentSandboxVerdict = "clean" | "unsafe" | "error";

export type AttachmentSandboxInput = {
  filename: string;
  mimeType: string;
  contents: Buffer;
};

export interface AttachmentSandboxProvider {
  readonly name: string;
  scan(input: AttachmentSandboxInput): Promise<AttachmentSandboxVerdict>;
}

type SandboxConfig = { name: string; endpoint: string; apiKey: string; timeoutMs: number };

function sandboxConfig(env: NodeJS.ProcessEnv = process.env): SandboxConfig | null {
  const name = env.ATTACHMENT_SANDBOX_PROVIDER?.trim();
  const endpoint = env.ATTACHMENT_SANDBOX_API_URL?.trim();
  const apiKey = env.ATTACHMENT_SANDBOX_API_KEY?.trim();
  if (!name || !endpoint || !apiKey || env.ATTACHMENT_SANDBOX_ENVIRONMENT !== "staging") return null;
  try {
    const parsed = new URL(endpoint);
    const local = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
    if (parsed.protocol !== "https:" && !(local && env.NODE_ENV !== "production")) return null;
  } catch {
    return null;
  }
  const timeout = Number.parseInt(env.ATTACHMENT_SANDBOX_TIMEOUT_MS ?? "15000", 10);
  return { name, endpoint, apiKey, timeoutMs: Number.isInteger(timeout) ? Math.max(1_000, Math.min(60_000, timeout)) : 15_000 };
}

class HttpAttachmentSandboxProvider implements AttachmentSandboxProvider {
  readonly name: string;
  private readonly config: SandboxConfig;

  constructor(config: SandboxConfig) { this.name = config.name; this.config = config; }

  async scan(input: AttachmentSandboxInput): Promise<AttachmentSandboxVerdict> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await fetch(this.config.endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.config.apiKey}` },
        body: JSON.stringify({ filename: input.filename, mimeType: input.mimeType, contentsBase64: input.contents.toString("base64") }),
      });
      const data = await response.json().catch(() => ({})) as { verdict?: unknown };
      if (!response.ok) return "error";
      if (data.verdict === "clean") return "clean";
      if (data.verdict === "unsafe") return "unsafe";
      return "error";
    } catch {
      return "error";
    } finally {
      clearTimeout(timer);
    }
  }
}

export function getAttachmentSandboxProvider(env: NodeJS.ProcessEnv = process.env): AttachmentSandboxProvider | null {
  const config = sandboxConfig(env);
  return config ? new HttpAttachmentSandboxProvider(config) : null;
}

export function attachmentSandboxStatus(env: NodeJS.ProcessEnv = process.env): { state: "CONFIGURED" | "NOT_CONFIGURED"; provider: string | null; environment: "staging" | "none" } {
  const config = sandboxConfig(env);
  return { state: config ? "CONFIGURED" : "NOT_CONFIGURED", provider: config?.name ?? null, environment: config ? "staging" : "none" };
}

export const attachmentSandboxConfigForTests = sandboxConfig;
