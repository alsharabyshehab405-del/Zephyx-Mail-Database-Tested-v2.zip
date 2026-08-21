export type RealtimeEvent = {
  id: string;
  event: "email.created" | "email.updated" | "notification.updated";
  data: { emailId?: string; notificationId?: string; change: "created" | "updated" | "deleted" };
};

type Listener = (event: RealtimeEvent) => void;
const listeners = new Map<string, Set<Listener>>();
const history = new Map<string, RealtimeEvent[]>();
let sequence = 0;
const MAX_HISTORY_PER_USER = 100;
const MAX_CONNECTIONS_PER_USER = 20;

export function subscribeToUserEvents(userId: string, listener: Listener): () => void {
  const current = listeners.get(userId) ?? new Set<Listener>();
  if (current.size >= MAX_CONNECTIONS_PER_USER) {
    throw Object.assign(new Error("Too many realtime connections"), { statusCode: 429 });
  }
  current.add(listener);
  listeners.set(userId, current);
  return () => {
    current.delete(listener);
    if (current.size === 0) listeners.delete(userId);
  };
}

export function publishUserEvent(userId: string, input: Omit<RealtimeEvent, "id">): RealtimeEvent {
  const event = { ...input, id: `${Date.now()}-${++sequence}` };
  const currentHistory = history.get(userId) ?? [];
  currentHistory.push(event);
  history.set(userId, currentHistory.slice(-MAX_HISTORY_PER_USER));
  for (const listener of listeners.get(userId) ?? []) listener(event);
  return event;
}

export function replayUserEvents(userId: string, lastEventId?: string): RealtimeEvent[] {
  const userHistory = history.get(userId) ?? [];
  if (!lastEventId) return userHistory;

  // Last-Event-ID is scoped to this user's stream. Never compare opaque IDs
  // across users, or a cursor from another stream could replay this user's data.
  const cursorIndex = userHistory.findIndex((event) => event.id === lastEventId);
  return cursorIndex < 0 ? [] : userHistory.slice(cursorIndex + 1);
}

export function clearRealtimeStateForTests(): void {
  listeners.clear();
  history.clear();
}
