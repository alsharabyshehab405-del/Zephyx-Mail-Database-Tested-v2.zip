import IORedis from "ioredis";

export type RealtimeEvent = {
  id: string;
  event: "email.created" | "email.updated" | "notification.updated";
  data: { emailId?: string; notificationId?: string; change: "created" | "updated" | "deleted" };
};

type Listener = (event: RealtimeEvent) => void;
const listeners = new Map<string, Set<Listener>>();
const memoryHistory = new Map<string, RealtimeEvent[]>();
let publisher: IORedis | undefined;
let subscriber: IORedis | undefined;
let subscriberReady = false;
const STREAM_KEY = "zephyx:realtime:events";
const channelFor = (userId: string) => `zephyx:realtime:user:${userId}`;

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
  const url = redisUrl();
  if (!url) return;
  subscriber = new IORedis(url, { maxRetriesPerRequest: 1, enableReadyCheck: true });
  subscriber.on("pmessage", (_pattern, channel, message) => {
    const userId = channel.slice("zephyx:realtime:user:".length);
    try {
      const event = JSON.parse(message) as RealtimeEvent;
      for (const listener of listeners.get(userId) ?? []) listener(event);
    } catch {
      // A malformed cross-replica message is ignored and cannot terminate the hub.
    }
  });
  subscriberReady = true;
}

export async function publishUserEvent(userId: string, input: Omit<RealtimeEvent, "id">): Promise<RealtimeEvent> {
  const redis = ensurePublisher();
  if (redis) {
    const id = await redis.xadd(STREAM_KEY, "MAXLEN", "~", String(realtimeConfig().replayLimit * 100), "*", "userId", userId, "event", input.event, "data", JSON.stringify(input.data));
    const event = { ...input, id: id ?? `${Date.now()}-0` };
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
  void ensureSubscriber().then(async () => { if (subscriber) await subscriber.psubscribe(channelFor(userId)); }).catch(() => undefined);
  return () => {
    current.delete(listener);
    if (current.size === 0) {
      listeners.delete(userId);
      void subscriber?.punsubscribe(channelFor(userId)).catch(() => undefined);
    }
  };
}

function parseStreamEntries(rows: Array<[string, string[]]>): RealtimeEvent[] {
  return rows.flatMap(([id, fields]) => {
    const values = new Map<string, string>();
    for (let i = 0; i < fields.length; i += 2) values.set(fields[i]!, fields[i + 1]!);
    try { return [{ id, event: values.get("event") as RealtimeEvent["event"], data: JSON.parse(values.get("data") ?? "{}")}]; } catch { return []; }
  });
}

export async function replayUserEvents(userId: string, lastEventId?: string): Promise<RealtimeEvent[]> {
  const redis = ensurePublisher();
  if (!redis) {
    const history = memoryHistory.get(userId) ?? [];
    if (!lastEventId) return history;
    const index = history.findIndex((event) => event.id === lastEventId);
    return index < 0 ? [] : history.slice(index + 1);
  }
  const rows = await redis.xrange(STREAM_KEY, "-", "+") as Array<[string, string[]]>;
  const events = parseStreamEntries(rows).filter((event) => event.data && (event as RealtimeEvent & { userId?: string }).userId === userId);
  // User ID is carried by the stream field; parse/filter explicitly below.
  const userEvents = rows.flatMap(([id, fields]) => {
    const values = new Map<string, string>(); for (let i = 0; i < fields.length; i += 2) values.set(fields[i]!, fields[i + 1]!);
    if (values.get("userId") !== userId) return [];
    try { return [{ id, event: values.get("event") as RealtimeEvent["event"], data: JSON.parse(values.get("data") ?? "{}") }]; } catch { return []; }
  });
  void events;
  if (!lastEventId) return userEvents.slice(-realtimeConfig().replayLimit);
  const index = userEvents.findIndex((event) => event.id === lastEventId);
  return index < 0 ? [] : userEvents.slice(index + 1).slice(0, realtimeConfig().replayLimit);
}

export async function clearRealtimeStateForTests(): Promise<void> {
  listeners.clear(); memoryHistory.clear();
  if (publisher) await publisher.del(STREAM_KEY).catch(() => undefined);
}
