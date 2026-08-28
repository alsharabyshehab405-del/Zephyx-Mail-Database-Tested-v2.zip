import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";
import { getCatchUpInbox, listFinanceRecords, listOrders, listSubscriptions, type FinanceRecord, type OrderRecord, type UnsubscribeResult } from "@/lib/feature-api";

type View = "orders" | "finance" | "subscriptions" | "catch-up";

export default function CommerceHub({ view = "orders" }: { view?: View }) {
  const [, setLocation] = useLocation();
  const { t } = useI18n();
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [finance, setFinance] = useState<FinanceRecord[]>([]);
  const [subscriptions, setSubscriptions] = useState<UnsubscribeResult[]>([]);
  const [catchUpCount, setCatchUpCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const request = view === "orders" ? listOrders().then((result) => setOrders(result.orders))
      : view === "finance" ? listFinanceRecords().then((result) => setFinance(result.records))
        : view === "subscriptions" ? listSubscriptions().then((result) => setSubscriptions(result.subscriptions))
          : getCatchUpInbox().then((result) => setCatchUpCount(result.total));
    void request.catch((reason) => setError(reason instanceof Error ? reason.message : t("navigation.unknownViewError"))).finally(() => setLoading(false));
  }, [t, view]);

  const tabs: Array<[View, string]> = [["orders", t("navigation.commerceOrders")], ["finance", t("navigation.commerceFinance")], ["subscriptions", t("navigation.commerceSubscriptions")], ["catch-up", t("navigation.commerceCatchUp")]];

  return <main className="min-h-screen bg-background p-6 md:p-10">
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div><p className="text-sm text-muted-foreground">Zephyx Mail</p><h1 className="text-3xl font-bold">{t("navigation.commerceTitle")}</h1><p className="mt-1 text-sm text-muted-foreground">{t("navigation.commerceDescription")}</p></div>
        <Button variant="outline" onClick={() => setLocation("/")}>{t("navigation.backToInbox")}</Button>
      </div>
      <nav className="mb-6 flex flex-wrap gap-2" aria-label={t("navigation.commerceViews")}>{tabs.map(([id, label]) => <Button key={id} variant={view === id ? "default" : "outline"} onClick={() => setLocation(`/commerce/${id}`)}>{label}</Button>)}</nav>
      {loading ? <p role="status" aria-live="polite" className="text-muted-foreground">{t("navigation.loading")}</p> : error ? <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-destructive">{error}</div> : view === "orders" ? <OrderList orders={orders} /> : view === "finance" ? <FinanceList records={finance} /> : view === "subscriptions" ? <SubscriptionList records={subscriptions} /> : <div className="rounded-xl border p-8"><h2 className="text-xl font-semibold">{t("navigation.commerceCatchUp")}</h2><p className="mt-2 text-muted-foreground">{t("navigation.catchUpDescription", { count: catchUpCount ?? 0 })}</p><Button className="mt-4" onClick={() => setLocation("/folder/inbox")}>{t("navigation.openInbox")}</Button></div>}
    </div>
  </main>;
}

function OrderList({ orders }: { orders: OrderRecord[] }) {
  const { t } = useI18n();
  if (!orders.length) return <Empty text={t("navigation.noOrderFacts")} />;
  return <div className="grid gap-3 md:grid-cols-2">{orders.map((order) => <article key={order.sourceEmailId} className="rounded-xl border p-4"><div className="flex items-start justify-between gap-3"><h2 className="font-semibold">{order.merchant || t("navigation.unknownMerchant")}</h2><span className="rounded-full bg-muted px-2 py-1 text-xs">{order.deliveryState}</span></div><p className="mt-2 text-sm">{t("navigation.orderPrefix")} {order.orderNumber || t("navigation.orderNumberUnavailable")}</p><p className="text-sm text-muted-foreground">{order.total ? `${order.total} ${order.currency || ""}` : t("navigation.amountUnavailable")}{order.estimatedDelivery ? ` · ${t("navigation.eta")} ${order.estimatedDelivery}` : ""}</p><p className="mt-2 text-xs text-muted-foreground">{t("navigation.trackingNotConfigured")}</p></article>)}</div>;
}

function FinanceList({ records }: { records: FinanceRecord[] }) {
  const { t } = useI18n();
  if (!records.length) return <Empty text={t("navigation.noFinanceFacts")} />;
  return <div className="grid gap-3 md:grid-cols-2">{records.map((record) => <article key={`${record.sourceEmailId}:${record.kind}`} className="rounded-xl border p-4"><div className="flex items-start justify-between gap-3"><h2 className="font-semibold capitalize">{record.kind}</h2><span className="rounded-full bg-muted px-2 py-1 text-xs">{record.paymentStatus}</span></div><p className="mt-2 text-sm">{record.merchant || t("navigation.merchantUnavailable")}</p><p className="text-sm text-muted-foreground">{record.amount ? `${record.amount} ${record.currency || ""}` : t("navigation.amountUnavailable")}{record.dueDate ? ` · ${t("navigation.due")} ${record.dueDate}` : ""}</p></article>)}</div>;
}

function SubscriptionList({ records }: { records: UnsubscribeResult[] }) {
  const { t } = useI18n();
  if (!records.length) return <Empty text={t("navigation.noUnsubscribeLinks")} />;
  return <div className="space-y-3">{records.map((record) => <article key={record.sourceEmailId} className="rounded-xl border p-4"><h2 className="font-semibold">{record.sender}</h2><p className="mt-1 text-xs text-muted-foreground">{t("navigation.unsubscribeExplicitAction")}</p><div className="mt-3 flex flex-wrap gap-2">{record.manualLinks.map((link) => <Button key={link} variant="outline" onClick={() => { if (window.confirm(t("navigation.confirmOpenUnsubscribe"))) window.open(link, "_blank", "noopener,noreferrer"); }} aria-label={`${t("navigation.openUnsubscribeLink")} — ${record.sender}`}>{t("navigation.openUnsubscribeLink")}</Button>)}</div></article>)}</div>;
}

function Empty({ text }: { text: string }) { return <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">{text}</div>; }
