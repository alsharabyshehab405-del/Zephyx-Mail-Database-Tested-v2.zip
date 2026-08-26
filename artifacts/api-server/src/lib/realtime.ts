import IORedis from "ioredis";
import { randomUUID } from "node:crypto";

export type RealtimeEvent = {
  id: string;
  event: "email.created" | "email.updated" | "notification.updated";
  data: { emailId?: string; notificationId?: string; change: "created" | "updated" | "deleted" };
};

type Listener = (event: RealtimeEvent) => void;
const listeners = new Map<string, Set<Listener>>();
const memoryHistory = new Map<string, RealtimeEvent[]>();
const redisStreamKeys = new Set<string>();
let publisher: IORedis | undefined;
let subscriber: IORedis | undefined;
let subscriberReady = false;
let subscriberInit: Promise<void> | undefined;
const locallyPublished = new Set<string>();
const LOCAL_PUBLISH_DEDUPE_LIMIT = 10_000;
const STREAM_KEY_PREFIX = "zephyx:realtime:user";
const channelFor = (userId: string) => `${STREAM_KEY_PREFIX}:channel:${userId}`;
const streamKeyFor = (userId: string) => `${STREAM_KEY_PREFIX}:stream:${userId}`;

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}
export const realtimeConfig = () => ({
  maxConnectionsPerUser: intEnv("SSE_MAX_CONNECTIONS_PER_USER", 20, 1, 1000),
  replayLimit: intEnv("SSE_REPLAY_LIMIT", 100, 1, 10000),
  heartbeatMs: intEnv("SSE_HEARTBEAT_MS", 25_000, 1000, 300_000),
});

function redisUrl(): string | undefined {
  return process.env.REDIS_URL?.trim() || undefined;
}
function ensurePublisher(): IORedis | undefined {
  if (!redisUrl()) return undefined;
  const url = redisUrl();
  if (!url) return undefined;
  publisher ??= new IORedis(url, { maxRetriesPerRequest: 1, enableReadyCheck: true });
  return publisher;
}
async function ensureSubscriber(): Promise<void> {
  if (subscriberReady || !redisUrl()) return;
  if (subscriberInit) return subscriberInit;
  subscriberInit = (async () => {
    const url = redisUrl();
    if (!url) return;
    const nextSubscriber = new IORedis(url, { maxRetriesPerRequest: 1, enableReadyCheck: true });
    nextSubscriber.on("pmessage", (_pattern, channel, message) => {
      const userId = channel.slice(`${STREAM_KEY_PREFIX}:channel:`.length);
      try {
        const event = JSON.parse(message) as RealtimeEvent;
        if (locallyPublished.delete(`${userId}:${event.id}`)) return;
        for (const listener of listeners.get(userId) ?? []) listener(event);
      } catch {
        // A malformed cross-replica message is ignored and cannot terminate the hub.
      }
    });
    subscriber = nextSubscriber;
    await nextSubscriber.psubscribe(`${STREAM_KEY_PREFIX}:channel:*`);
    subscriberReady = true;
  })().catch((error) => {
    subscriberInit = undefined;
    throw error;
  });
  return subscriberInit;
}

export async function publishUserEvent(userId: string, input: Omit<RealtimeEvent, "id">): Promise<RealtimeEvent> {
  const redis = ensurePublisher();
  if (redis) {
    const streamKey = streamKeyFor(userId);
    redisStreamKeys.add(streamKey);
    const eventId = randomUUID();
    await redis.xadd(streamKey, "MAXLEN", "~", String(realtimeConfig().replayLimit), "*", "eventId", eventId, "event", input.event, "data", JSON.stringify(input.data));
    const event = { ...input, id: eventId };
    locallyPublished.add(`${userId}:${event.id}`);
    if (locallyPublished.size > LOCAL_PUBLISH_DEDUPE_LIMIT) {
      const oldest = locallyPublished.values().next().value as string | undefined;
      if (oldest) locallyPublished.delete(oldest);
    }
    for (const listener of listeners.get(userId) ?? []) listener(event);
    await redis.publish(channelFor(userId), JSON.stringify(event));
    return event;
  }
  const event = { ...input, id: `${Date.now()}-${Math.random().toString(36).slice(2)}` };
  const history = memoryHistory.get(userId) ?? [];
  history.push(event);
  memoryHistory.set(userId, history.slice(-realtimeConfig().replayLimit));
  for (const listener of listeners.get(userId) ?? []) listener(event);
  return event;
}

export function subscribeToUserEvents(userId: string, listener: Listener): () => void {
  const current = listeners.get(userId) ?? new Set<Listener>();
  if (current.size >= realtimeConfig().maxConnectionsPerUser) throw Object.assign(new Error("Too many realtime connections"), { statusCode: 429 });
  current.add(listener);
  listeners.set(userId, current);
  void ensureSubscriber().catch(() => undefined);
  return () => {
    current.delete(listener);
    if (current.size === 0) listeners.delete(userId);
  };
}

export async function replayUserEvents(userId: string, lastEventId?: string): Promise<RealtimeEvent[]> {
  const redis = ensurePublisher();
  const limit = realtimeConfig().replayLimit;
  if (!redis) {
    const history = memoryHistory.get(userId) ?? [];
    if (!lastEventId) return history.slice(-limit);
    const index = history.findIndex((event) => event.id === lastEventId);
    return index < 0 ? [] : history.slice(index + 1, index + 1 + limit);
  }

  const streamKey = streamKeyFor(userId);
  redisStreamKeys.add(streamKey);
  const rows = await redis.xrevrange(streamKey, "+", "-", "COUNT", String(limit)) as Array<[string, string[]]>;
  const events = rows.reverse().flatMap(([streamId, fields]) => {
    const values = new Map<string, string>();
    for (let i = 0; i < fields.length; i += 2) values.set(fields[i]!, fields[i + 1]!);
    try {
      return [{ id: values.get("eventId") ?? streamId, event: values.get("event") as RealtimeEvent["event"], data: JSON.parse(values.get("data") ?? "{}") }];
    } catch { return []; }
  });
  if (!lastEventId) return events;
  const index = events.findIndex((event) => event.id === lastEventId);
  return index < 0 ? [] : events.slice(index + 1, index + 1 + limit);
}

export async function clearRealtimeStateForTests(): Promise<void> {
  listeners.clear();
  memoryHistory.clear();
  locallyPublished.clear();
  if (publisher && redisStreamKeys.size > 0) {
    await publisher.del(...redisStreamKeys).catch(() => undefined);
  }
  redisStreamKeys.clear();
}
