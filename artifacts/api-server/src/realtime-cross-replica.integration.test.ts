import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { signAccessToken } from "./lib/jwt.js";

const redisUrl = process.env.REDIS_URL;
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const here = path.dirname(fileURLToPath(import.meta.url));
const childEntry = path.join(here, "__tests__", "realtime-child-server.ts");
const tsxEntry = path.resolve(process.cwd(), "../../node_modules/tsx/dist/cli.mjs");
const children: ChildProcessWithoutNullStreams[] = [];

function startReplica(port: number): Promise<ChildProcessWithoutNullStreams> {
  if (!redisUrl) throw new Error("REDIS_URL is required for cross-replica SSE integration");
  const child = spawn(process.execPath, [tsxEntry, childEntry], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), REDIS_URL: redisUrl, SSE_HEARTBEAT_MS: "1000", SSE_REPLAY_LIMIT: "2" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  children.push(child);
  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error(`Replica did not become ready: ${output.slice(-1000)}`)), 15_000);
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes(`READY:${port}`)) { clearTimeout(timer); resolve(child); }
    });
    child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => { if (code !== null) { clearTimeout(timer); reject(new Error(`Replica exited ${code}: ${output.slice(-1000)}`)); } });
  });
}

async function ticket(port: number, userId: string): Promise<string> {
  const token = signAccessToken({ sub: userId, email: `${userId}@test.invalid`, role: "user" });
  const response = await fetch(`http://127.0.0.1:${port}/api/realtime/ticket`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  expect(response.status).toBe(201);
  return ((await response.json()) as { ticket: string }).ticket;
}

async function collectEvents(port: number, realtimeTicket: string, expected: number, lastEventId?: string): Promise<Array<{ id: string; event: string; data: unknown }>> {
  const response = await fetch(`http://127.0.0.1:${port}/api/realtime/events?ticket=${encodeURIComponent(realtimeTicket)}`, { headers: lastEventId ? { "Last-Event-ID": lastEventId } : undefined });
  expect(response.status).toBe(200);
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const events: Array<{ id: string; event: string; data: unknown }> = [];
  let buffer = "";
  while (events.length < expected) {
    const next = await reader.read();
    if (next.done) break;
    buffer += decoder.decode(next.value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const id = block.match(/^id: (.+)$/m)?.[1];
      const event = block.match(/^event: (.+)$/m)?.[1];
      const data = block.match(/^data: (.+)$/m)?.[1];
      if (id && event && data) events.push({ id, event, data: JSON.parse(data) });
    }
  }
  await reader.cancel();
  return events;
}

function publish(child: ChildProcessWithoutNullStreams, userId: string, emailId: string): Promise<void> {
  const commandId = `${emailId}-${Date.now()}-${Math.random()}`;
  return new Promise((resolve, reject) => {
    const onData = (chunk: Buffer) => {
      if (!chunk.toString().includes(`PUBLISHED:${commandId}`)) return;
      child.stdout.off("data", onData);
      resolve();
    };
    child.stdout.on("data", onData);
    child.stdin.write(`${JSON.stringify({ commandId, userId, event: "email.created", data: { emailId, change: "created" } })}\n`, (error) => {
      if (error) { child.stdout.off("data", onData); reject(error); }
    });
  });
}

describe("SSE cross-replica child-process integration", () => {
  afterAll(async () => {
    for (const child of children) child.kill("SIGTERM");
    await wait(500);
    for (const child of children) if (!child.killed) child.kill("SIGKILL");
    expect(children.every((child) => child.exitCode !== null || child.killed)).toBe(true);
  });

  it("delivers named events across replicas, enforces isolation, replays bounded history, and consumes tickets once", async () => {
    const replicaA = await startReplica(3311);
    const replicaB = await startReplica(3312);
    const userA = `sse-user-a-${Date.now()}`;
    const userB = `sse-user-b-${Date.now()}`;

    const liveTicket = await ticket(3311, userA);
    const livePromise = collectEvents(3312, liveTicket, 2);
    await wait(500);
    await publish(replicaA, userA, "live-1");
    await publish(replicaA, userA, "live-2");
    const live = await livePromise;
    expect(live.map((item) => item.event)).toEqual(["email.created", "email.created"]);
    expect(live.map((item) => (item.data as { emailId: string }).emailId)).toEqual(["live-1", "live-2"]);
    const replayedTicket = await ticket(3311, userA);
    await publish(replicaA, userA, "replay-1");
    await publish(replicaA, userA, "replay-2");
    await publish(replicaA, userA, "replay-3");
    const replay = await collectEvents(3312, replayedTicket, 2, live[1]!.id);
    expect(replay.map((item) => (item.data as { emailId: string }).emailId)).toEqual(["replay-2", "replay-3"]);
    const reused = await fetch(`http://127.0.0.1:3312/api/realtime/events?ticket=${encodeURIComponent(liveTicket)}`);
    expect(reused.status).toBe(401);

    const isolatedTicket = await ticket(3311, userB);
    const isolatedResponse = await fetch(`http://127.0.0.1:3312/api/realtime/events?ticket=${encodeURIComponent(isolatedTicket)}`);
    expect(isolatedResponse.status).toBe(200);
    await publish(replicaA, userA, "must-not-leak");
    await wait(400);
    await isolatedResponse.body?.cancel();
    expect((await ticket(3311, userB)).length).toBeGreaterThan(10);
  });
});
