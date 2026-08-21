import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

export function useRealtimeEvents(enabled: boolean): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || typeof EventSource === "undefined") return;
    let closed = false;
    let source: EventSource | null = null;
    let reconnectTimer: number | undefined;

    const connect = () => {
      if (closed) return;
      source = new EventSource("/api/realtime/events", { withCredentials: true });
      source.onmessage = (message) => {
        try {
          const event = JSON.parse(message.data) as { event?: string };
          if (event.event?.startsWith("email.") || event.event === "notification.updated") {
            void queryClient.invalidateQueries({ queryKey: ["emails"] });
            void queryClient.invalidateQueries({ queryKey: ["notifications"] });
          }
        } catch {
          // Ignore malformed events; the next refresh/reconnect remains authoritative.
        }
      };
      source.onerror = () => {
        source?.close();
        source = null;
        if (!closed && reconnectTimer === undefined) {
          reconnectTimer = window.setTimeout(() => {
            reconnectTimer = undefined;
            connect();
          }, 5000);
        }
      };
    };

    connect();
    return () => {
      closed = true;
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      source?.close();
    };
  }, [enabled, queryClient]);
}
