import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth.js";
import { consumeRealtimeTicket, issueRealtimeTicket } from "../lib/realtime-ticket.js";
import { realtimeConfig, replayUserEvents, subscribeToUserEvents } from "../lib/realtime.js";

function writeEvent(res: Response, event: { id: string; event: string; data: unknown }): void {
  res.write(`id: ${event.id}\nevent: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`);
}

export function realtimeRouter(): Router {
  const router = createRouter();
  router.post("/ticket", requireAuth, async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user.sub;
    res.status(201).json(await issueRealtimeTicket(userId));
  });
  router.get("/events", async (req: Request, res: Response) => {
    const ticket = typeof req.query.ticket === "string" ? req.query.ticket : "";
    const userId = await consumeRealtimeTicket(ticket);
    if (!userId) { res.status(401).json({ error: "Invalid or expired realtime ticket" }); return; }
    let unsubscribe: (() => void) | undefined;
    let heartbeat: NodeJS.Timeout | undefined;
    try {
      const config = realtimeConfig();
      res.status(200).set({ "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
      res.flushHeaders();
      res.write(": connected\n\n");
      const lastEventId = req.get("Last-Event-ID") ?? undefined;
      for (const event of await replayUserEvents(userId, lastEventId)) writeEvent(res, event);
      unsubscribe = subscribeToUserEvents(userId, (event) => writeEvent(res, event));
      heartbeat = setInterval(() => res.write(": heartbeat\n\n"), config.heartbeatMs);
      req.on("close", () => { if (heartbeat) clearInterval(heartbeat); unsubscribe?.(); if (!res.writableEnded) res.end(); });
    } catch (error) {
      if (heartbeat) clearInterval(heartbeat); unsubscribe?.();
      const statusCode = (error as { statusCode?: number }).statusCode ?? 503;
      if (!res.headersSent) res.status(statusCode).json({ error: statusCode === 429 ? "Too many realtime connections" : "Realtime unavailable" }); else res.end();
    }
  });
  return router;
}
