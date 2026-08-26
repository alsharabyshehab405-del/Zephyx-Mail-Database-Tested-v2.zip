export type SafeOfflineOperation = "mark_read" | "mark_unread" | "star" | "unstar";

export type OfflineMutation = {
  id: string;
  operation: SafeOfflineOperation;
  emailId: string;
  expectedVersion: number;
  createdAt: number;
  expiresAt: number;
};

const STORAGE_KEY = "novamail.offline.safe-mutations.v1";
const MAX_ITEMS = 100;
const TTL_MS = 24 * 60 * 60 * 1000;

function storage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

function read(): OfflineMutation[] {
  const raw = storage()?.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is OfflineMutation => {
      const candidate = item as Partial<OfflineMutation>;
      return typeof candidate.id === "string" && typeof candidate.emailId === "string" && typeof candidate.operation === "string" && typeof candidate.expectedVersion === "number" && typeof candidate.expiresAt === "number";
    });
  } catch {
    return [];
  }
}

function write(items: OfflineMutation[]): void {
  storage()?.setItem(STORAGE_KEY, JSON.stringify(items.slice(-MAX_ITEMS)));
}

export class OfflineMutationQueue {
  enqueue(operation: SafeOfflineOperation, emailId: string, expectedVersion: number): OfflineMutation {
    if (!emailId || !Number.isInteger(expectedVersion) || expectedVersion < 0) throw new Error("Invalid offline mutation");
    const now = Date.now();
    const item: OfflineMutation = { id: crypto.randomUUID(), operation, emailId, expectedVersion, createdAt: now, expiresAt: now + TTL_MS };
    const current = read().filter((entry) => entry.expiresAt > now);
    write([...current, item]);
    return item;
  }

  pending(now = Date.now()): OfflineMutation[] {
    return read().filter((entry) => entry.expiresAt > now);
  }

  acknowledge(id: string): void {
    write(read().filter((entry) => entry.id !== id));
  }

  clearExpired(now = Date.now()): void {
    write(read().filter((entry) => entry.expiresAt > now));
  }

  clear(): void {
    storage()?.removeItem(STORAGE_KEY);
  }
}
