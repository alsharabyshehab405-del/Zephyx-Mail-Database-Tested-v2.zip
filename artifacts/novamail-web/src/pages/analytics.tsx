import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { analyticsOverview } from "@/lib/feature-api";

export default function Analytics() {
  const [, setLocation] = useLocation();
  const [data, setData] = useState<Awaited<ReturnType<typeof analyticsOverview>> | null>(null);
  useEffect(() => { void analyticsOverview().then(setData).catch(() => setData(null)); }, []);
  const max = Math.max(1, ...(data?.activityByHour.map((item) => item.count) ?? [1]));
  return (
    <main className="min-h-screen bg-background p-6 md:p-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between gap-4"><div><p className="text-sm text-muted-foreground">Insights</p><h1 className="text-3xl font-bold">Email analytics</h1></div><Button variant="outline" onClick={() => setLocation("/")}>Back to inbox</Button></div>
        {!data ? <p className="text-muted-foreground">Loading analytics…</p> : <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border p-5"><p className="text-sm text-muted-foreground">Total emails</p><p className="mt-2 text-3xl font-bold">{data.totalEmails.toLocaleString()}</p></div>
            <div className="rounded-xl border p-5"><p className="text-sm text-muted-foreground">Unread</p><p className="mt-2 text-3xl font-bold">{data.unreadEmails.toLocaleString()}</p></div>
            <div className="rounded-xl border p-5"><p className="text-sm text-muted-foreground">Storage</p><p className="mt-2 text-3xl font-bold">{(data.storageBytes / 1024 / 1024).toFixed(1)} MB</p></div>
          </div>
          <section className="mt-6 rounded-xl border p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">Peak activity</h2><span className="text-sm text-muted-foreground">{data.peakHour}:00</span></div><div className="mt-6 flex h-48 items-end gap-1">{data.activityByHour.map((item) => <div key={item.hour} className="flex flex-1 flex-col items-center gap-1"><div className="w-full rounded-t bg-primary/70" style={{ height: `${Math.max(4, item.count / max * 100)}%` }} title={`${item.hour}:00 — ${item.count}`} /><span className="text-[10px] text-muted-foreground">{item.hour}</span></div>)}</div></section>
        </>}
      </div>
    </main>
  );
}
