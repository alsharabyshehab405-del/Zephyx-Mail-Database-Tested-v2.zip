import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_MAX_AGE_MS = 5 * 60_000;
const usedNonces = new Map<string, number>();

function digest(secret: string, timestamp: number, nonce: string, payload: string): Buffer {
  return createHmac("sha256", secret).update(`${timestamp}.${nonce}.${payload}`, "utf8").digest();
}

export function signWebhookPayload(secret: string, payload: string, now = Date.now(), nonce = crypto.randomUUID()): { timestamp: number; nonce: string; signature: string } {
  const timestamp = Math.floor(now / 1000);
  return { timestamp, nonce, signature: `v1=${digest(secret, timestamp, nonce, payload).toString("hex")}` };
}

export function verifyWebhookSignature(secret: string, payload: string, timestamp: number, nonce: string, signature: string, now = Date.now(), maxAgeMs = DEFAULT_MAX_AGE_MS): boolean {
  if (!Number.isInteger(timestamp) || !nonce || !/^v1=[a-f0-9]{64}$/.test(signature)) return false;
  const age = Math.abs(now - timestamp * 1000);
  if (age > maxAgeMs) return false;
  const key = `${timestamp}:${nonce}`;
  const expiry = usedNonces.get(key);
  if (expiry && expiry > now) return false;
  const expected = digest(secret, timestamp, nonce, payload);
  const provided = Buffer.from(signature.slice(3), "hex");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return false;
  usedNonces.set(key, now + maxAgeMs);
  for (const [storedKey, storedExpiry] of usedNonces) if (storedExpiry <= now) usedNonces.delete(storedKey);
  return true;
}

export function clearWebhookReplayStateForTests(): void {
  usedNonces.clear();
}
