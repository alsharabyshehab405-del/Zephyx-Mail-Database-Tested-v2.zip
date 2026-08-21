import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth.js";
import { replayUserEvents, subscribeToUserEvents } from "../lib/realtime.js";

function writeEvent(res: Response, event: { id: string; event: string; data: unknown }): void {
  res.write(`id: ${event.id}\n`);
  res.write(`event: ${event.event}\n`);
  res.write(`data: ${JSON.stringify(event.data)}\n\n`);
}

export function realtimeRouter(): Router {
  const router = createRouter();
  router.get("/events", requireAuth, (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user.sub;
    let unsubscribe: (() => void) | undefined;
    try {
      res.status(200);
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();
      res.write(": connected\n\n");

      const lastEventId = req.get("Last-Event-ID") ?? undefined;
      for (const event of replayUserEvents(userId, lastEventId)) writeEvent(res, event);
      unsubscribe = subscribeToUserEvents(userId, (event) => writeEvent(res, event));
      const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 25_000);
      req.on("close", () => {
        clearInterval(heartbeat);
        unsubscribe?.();
        if (!res.writableEnded) res.end();
      });
    } catch (error) {
      unsubscribe?.();
      const statusCode = (error as { statusCode?: number }).statusCode ?? 503;
      if (!res.headersSent) res.status(statusCode).json({ code: "REALTIME_UNAVAILABLE", message: statusCode === 429 ? "Too many realtime connections" : "Realtime unavailable" });
      else res.end();
    }
  });
  return router;
}
