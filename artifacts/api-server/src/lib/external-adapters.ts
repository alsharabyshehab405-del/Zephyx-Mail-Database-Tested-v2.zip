import net from "node:net";
import { logger } from "./logger.js";

export type ScanResult = { clean: boolean; reason?: string };

export interface AntivirusScanner {
  scan(input: Buffer, signal?: AbortSignal): Promise<ScanResult>;
}

export class NotConfiguredAntivirusScanner implements AntivirusScanner {
  async scan(): Promise<ScanResult> {
    return { clean: false, reason: "antivirus_not_configured" };
  }
}

export class FakeAntivirusScanner implements AntivirusScanner {
  constructor(private readonly result: ScanResult = { clean: true }) {}
  async scan(): Promise<ScanResult> {
    return this.result;
  }
}

export class ClamAvInstreamScanner implements AntivirusScanner {
  constructor(private readonly host: string, private readonly port: number, private readonly timeoutMs = 15_000) {}

  scan(input: Buffer, signal?: AbortSignal): Promise<ScanResult> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: this.host, port: this.port });
      let output = "";
      let settled = false;
      const finish = (error?: Error, result?: ScanResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        if (error) reject(error);
        else resolve(result ?? { clean: false, reason: "clamav_empty_response" });
      };
      const timer = setTimeout(() => finish(new Error("ClamAV scan timed out")), this.timeoutMs);
      const onAbort = () => finish(new Error("ClamAV scan aborted"));
      signal?.addEventListener("abort", onAbort, { once: true });
      socket.on("connect", () => {
        const header = Buffer.alloc(4);
        header.writeUInt32BE(input.length, 0);
        socket.write("zINSTREAM\\0");
        socket.write(header);
        socket.write(input);
        socket.write(Buffer.alloc(4));
      });
      socket.on("data", (chunk: Buffer) => {
        output += chunk.toString("utf8");
      });
      socket.on("end", () => {
        signal?.removeEventListener("abort", onAbort);
        if (/FOUND/i.test(output)) finish(undefined, { clean: false, reason: output.trim().slice(0, 240) });
        else if (/OK/i.test(output)) finish(undefined, { clean: true });
        else finish(new Error("ClamAV returned an invalid response"));
      });
      socket.on("error", (error) => finish(error));
    });
  }
}

export type PushMessage = { token: string; title: string; body: string; data?: Record<string, string> };
export interface PushDeliveryAdapter { deliver(message: PushMessage, signal?: AbortSignal): Promise<void>; }

export class NotConfiguredPushAdapter implements PushDeliveryAdapter {
  constructor(private readonly provider: string) {}
  async deliver(): Promise<void> {
    throw new Error(`${this.provider}_not_configured`);
  }
}

export class FakePushAdapter implements PushDeliveryAdapter {
  readonly messages: PushMessage[] = [];
  async deliver(message: PushMessage): Promise<void> {
    this.messages.push({ ...message, data: message.data ? { ...message.data } : undefined });
  }
}

export class FcmHttpAdapter implements PushDeliveryAdapter {
  constructor(private readonly projectId: string, private readonly accessToken: string, private readonly fetchImpl: typeof fetch = fetch) {}
  async deliver(message: PushMessage, signal?: AbortSignal): Promise<void> {
    const response = await this.fetchImpl(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(this.projectId)}/messages:send`, {
      method: "POST",
      signal,
      headers: { authorization: `Bearer ${this.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ message: { token: message.token, notification: { title: message.title, body: message.body }, data: message.data ?? {} } }),
    });
    if (!response.ok) throw new Error(`FCM delivery failed with status ${response.status}`);
  }
}

export function createAntivirusScanner(env: NodeJS.ProcessEnv = process.env): AntivirusScanner {
  if (env.NODE_ENV === "test") return new FakeAntivirusScanner();
  if (env.ATTACHMENT_SCANNING_ENABLED !== "true") return new NotConfiguredAntivirusScanner();
  const host = env.CLAMAV_HOST?.trim();
  const port = Number(env.CLAMAV_PORT ?? "3310");
  if (!host || !Number.isInteger(port) || port <= 0 || port > 65_535) throw new Error("ClamAV configuration is invalid");
  return new ClamAvInstreamScanner(host, port);
}

export function createPushAdapter(env: NodeJS.ProcessEnv = process.env): PushDeliveryAdapter {
  if (env.NODE_ENV === "test") return new FakePushAdapter();
  if (env.FCM_ENABLED === "true") {
    if (!env.FCM_PROJECT_ID || !env.FCM_ACCESS_TOKEN) throw new Error("FCM_PROJECT_ID and FCM_ACCESS_TOKEN are required");
    return new FcmHttpAdapter(env.FCM_PROJECT_ID, env.FCM_ACCESS_TOKEN);
  }
  if (env.WEB_PUSH_ENABLED === "true") {
    logger.warn("Web Push is enabled but requires a deployment-specific sender implementation");
    return new NotConfiguredPushAdapter("web_push");
  }
  return new NotConfiguredPushAdapter("push");
}
