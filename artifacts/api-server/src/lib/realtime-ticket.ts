import { randomBytes } from "node:crypto";
import IORedis from "ioredis";

const TTL_MS = 60_000;
const memoryTickets = new Map<string, { userId: string; expiresAt: number }>();
let redis: IORedis | undefined;
function ticketKey(ticket: string): string { return `zephyx:realtime:ticket:${ticket}`; }
function getRedis(): IORedis | undefined {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return undefined;
  redis ??= new IORedis(url, { maxRetriesPerRequest: 1, enableReadyCheck: true });
  return redis;
}

export async function issueRealtimeTicket(userId: string): Promise<{ ticket: string; expiresInMs: number }> {
  const ticket = randomBytes(32).toString("base64url");
  const client = getRedis();
  if (client) await client.set(ticketKey(ticket), userId, "PX", TTL_MS, "NX");
  else memoryTickets.set(ticket, { userId, expiresAt: Date.now() + TTL_MS });
  return { ticket, expiresInMs: TTL_MS };
}

export async function consumeRealtimeTicket(ticket: string): Promise<string | null> {
  if (!ticket || ticket.length > 128) return null;
  const client = getRedis();
  if (client) return await client.getdel(ticketKey(ticket));
  const record = memoryTickets.get(ticket);
  memoryTickets.delete(ticket);
  return record && record.expiresAt > Date.now() ? record.userId : null;
}

export async function clearRealtimeTicketsForTests(): Promise<void> { memoryTickets.clear(); }
