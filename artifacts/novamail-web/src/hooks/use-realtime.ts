import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

type WireEvent = { id?: string; event?: string; data?: string };
function accessToken(): string | null { return typeof window === "undefined" ? null : sessionStorage.getItem("novamail-access") || localStorage.getItem("novamail-access"); }

export function useRealtimeEvents(enabled: boolean): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled || typeof window === "undefined" || !window.fetch) return;
    let closed = false; let reconnectTimer: number | undefined; let lastEventId: string | undefined; const controllers = new Set<AbortController>();
    const invalidate = (eventName: string) => { if (eventName.startsWith("email.")) { void queryClient.invalidateQueries({ queryKey: ["emails"] }); if (eventName === "email.updated") void queryClient.invalidateQueries({ queryKey: ["email"] }); } if (eventName === "notification.updated") void queryClient.invalidateQueries({ queryKey: ["notifications"] }); };
    const connect = async () => {
      if (closed) return;
      const token = accessToken(); if (!token) return;
      const ticketResponse = await fetch("/api/realtime/ticket", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      if (!ticketResponse.ok) { if (!closed) reconnectTimer = window.setTimeout(() => { reconnectTimer = undefined; void connect(); }, 5000); return; }
      const ticket = (await ticketResponse.json() as { ticket: string }).ticket;
      const controller = new AbortController(); controllers.add(controller);
      try {
        const response = await fetch(`/api/realtime/events?ticket=${encodeURIComponent(ticket)}`, { headers: lastEventId ? { "Last-Event-ID": lastEventId } : {}, signal: controller.signal });
        if (!response.ok || !response.body) throw new Error("SSE connection failed");
        const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let current: WireEvent = {};
        while (!closed) { const chunk = await reader.read(); if (chunk.done) break; buffer += decoder.decode(chunk.value, { stream: true }); const blocks = buffer.split("\n\n"); buffer = blocks.pop() ?? ""; for (const block of blocks) { current = {}; for (const line of block.split("\n")) { if (line.startsWith("id: ")) current.id = line.slice(4); else if (line.startsWith("event: ")) current.event = line.slice(7); else if (line.startsWith("data: ")) current.data = (current.data ?? "") + line.slice(6); } if (current.id && current.id === lastEventId) continue; if (current.id) lastEventId = current.id; if (current.event && current.data) { try { JSON.parse(current.data); invalidate(current.event); } catch { /* malformed event is isolated */ } } } }
      } catch { if (!closed) { if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer); reconnectTimer = window.setTimeout(() => { reconnectTimer = undefined; void connect(); }, 1500); } } finally { controllers.delete(controller); }
    };
    void connect();
    return () => { closed = true; if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer); controllers.forEach((controller) => controller.abort()); };
  }, [enabled, queryClient]);
}
