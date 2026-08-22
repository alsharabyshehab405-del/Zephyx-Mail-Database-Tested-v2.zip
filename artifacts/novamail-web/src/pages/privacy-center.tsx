import { Activity, ArrowLeft, CheckCircle2, LockKeyhole, MonitorSmartphone, ShieldCheck } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { BrandMark } from "@/components/brand-mark";
import { Sidebar } from "@/components/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/hooks/use-i18n";
import { getPrivacyCenter, updatePrivacyCenter } from "@/lib/feature-api";

function dateLabel(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function PrivacyCenter() {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const privacyQuery = useQuery({ queryKey: ["privacy-center"], queryFn: getPrivacyCenter });
  const updateMutation = useMutation({
    mutationFn: updatePrivacyCenter,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ["privacy-center"] });
      const previous = queryClient.getQueryData<Awaited<ReturnType<typeof getPrivacyCenter>>>(["privacy-center"]);
      if (previous) {
        queryClient.setQueryData(["privacy-center"], {
          ...previous,
          controls: { ...previous.controls, ...variables },
        });
      }
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(["privacy-center"], context.previous);
    },
    onSuccess: (data) => queryClient.setQueryData(["privacy-center"], data),
  });

  if (privacyQuery.isLoading) {
    return <main className="min-h-screen p-6" aria-busy="true" aria-label={t("workspace.privacyCenter")}><div className="mx-auto max-w-5xl space-y-4"><div className="novamail-workspace-skeleton h-28" /><div className="novamail-workspace-skeleton h-44" /><div className="novamail-workspace-skeleton h-44" /></div></main>;
  }
  if (privacyQuery.isError || !privacyQuery.data) {
    return <main className="min-h-screen p-6"><div className="mx-auto max-w-xl rounded-2xl border p-6 text-center" role="alert"><p className="font-semibold">{t("workspace.privacyLoadFailed")}</p><Button className="mt-4" onClick={() => privacyQuery.refetch()}>{t("workspace.privacyRetry")}</Button></div></main>;
  }

  const state = privacyQuery.data;
  const providerRows = [
    ["providerAi", state.providers.ai],
    ["providerGmail", state.providers.gmail],
    ["providerOutlook", state.providers.outlook],
    ["providerClamav", state.providers.clamav],
    ["providerPush", state.providers.push],
  ] as const;
  const save = (key: "externalImagesBlocked" | "trackingPixelsBlocked", value: boolean) => updateMutation.mutate({ [key]: value });
  const providerLabel = (status: "connected" | "not_configured") => status === "connected" ? t("workspace.accountConnected") : t("workspace.accountNotConfigured");

  return (
    <div className="flex min-h-screen bg-background" dir="auto">
      <div className="hidden shrink-0 lg:block"><Sidebar currentFolder="settings" /></div>
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-border/60 bg-card p-5 shadow-sm sm:p-7">
            <div className="space-y-3"><BrandMark /><p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">{t("workspace.privacyCenter")}</p><h1 className="text-3xl font-bold tracking-tight">{t("workspace.privacyCenter")}</h1><p className="max-w-2xl text-muted-foreground">{t("workspace.privacyCenterHint")}</p></div>
            <Link href="/workspace"><Button variant="outline"><ArrowLeft className="me-2 h-4 w-4" aria-hidden="true" />{t("workspace.backToWorkspace")}</Button></Link>
          </header>

          <Card className="border-primary/20 bg-primary/[0.03]">
            <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />{t("workspace.privacyCenter")}</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <label className="flex min-h-12 items-center justify-between gap-4 rounded-xl border bg-background p-3 text-sm font-medium"><span>{t("workspace.privacyExternalImages")}</span><input type="checkbox" checked={state.controls.externalImagesBlocked} onChange={(event) => save("externalImagesBlocked", event.target.checked)} aria-label={t("workspace.privacyExternalImages")} /></label>
              <label className="flex min-h-12 items-center justify-between gap-4 rounded-xl border bg-background p-3 text-sm font-medium"><span>{t("workspace.privacyTrackingPixels")}</span><input type="checkbox" checked={state.controls.trackingPixelsBlocked} onChange={(event) => save("trackingPixelsBlocked", event.target.checked)} aria-label={t("workspace.privacyTrackingPixels")} /></label>
              <p className="flex items-start gap-2 text-xs text-muted-foreground sm:col-span-2"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{t("workspace.privacyTransportOnly")}</p>
              {updateMutation.isSuccess ? <p className="text-sm text-primary sm:col-span-2" role="status">{t("workspace.privacySaved")}</p> : null}
              {updateMutation.isError ? <p className="text-sm text-destructive sm:col-span-2" role="alert">{t("workspace.actionFailed")}</p> : null}
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card><CardHeader><CardTitle className="flex items-center gap-2"><MonitorSmartphone className="h-5 w-5 text-primary" aria-hidden="true" />{t("workspace.privacySessions")}</CardTitle></CardHeader><CardContent className="space-y-3">{state.sessions.length ? state.sessions.map((session) => <div key={session.id} className="flex items-start justify-between gap-3 rounded-xl border p-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{session.deviceName || session.userAgent || t("workspace.privacySessions")}</p><p className="text-xs text-muted-foreground">{dateLabel(session.lastUsedAt || session.createdAt, locale)}</p></div>{session.current ? <Badge>{t("workspace.accountConnected")}</Badge> : null}</div>) : <p className="text-sm text-muted-foreground">{t("workspace.emptyState")}</p>}</CardContent></Card>
            <Card><CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5 text-primary" aria-hidden="true" />{t("workspace.privacyAccessLog")}</CardTitle></CardHeader><CardContent className="space-y-3">{state.accessLog.length ? state.accessLog.slice(0, 8).map((entry) => <div key={entry.id} className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm"><span className="min-w-0 truncate">{entry.action}</span><span className="shrink-0 text-xs text-muted-foreground">{dateLabel(entry.createdAt, locale)}</span></div>) : <p className="text-sm text-muted-foreground">{t("workspace.emptyState")}</p>}</CardContent></Card>
          </div>

          <Card><CardHeader><CardTitle>{t("workspace.privacyProviders")}</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{providerRows.map(([key, status]) => <div key={key} className="rounded-xl border p-3"><p className="text-sm font-medium">{t(`workspace.${key}`)}</p><p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">{status === "connected" ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> : null}{providerLabel(status)}</p></div>)}</CardContent></Card>
        </div>
      </main>
    </div>
  );
}
