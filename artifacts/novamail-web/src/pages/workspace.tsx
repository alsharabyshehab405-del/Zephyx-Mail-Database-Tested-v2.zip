import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowUpRight, CalendarDays, CheckCircle2, Clock3, Inbox, ListTodo, Loader2, Mail, Search, Sparkles, TimerReset } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/hooks/use-i18n";
import { aiProductivityInsights, createFollowUp, createTask, updateFollowUp, updateTask, workspaceSnapshot, type ProductivityInsight } from "@/lib/feature-api";

function formatDate(value: string | null | undefined, locale: string, options: Intl.DateTimeFormatOptions = {}) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", ...options }).format(date);
}

export default function Workspace() {
  const [, setLocation] = useLocation();
  const { t, locale } = useI18n();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [followUpEmailId, setFollowUpEmailId] = useState<string | null>(null);
  const [followUpAt, setFollowUpAt] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [insightFor, setInsightFor] = useState<string | null>(null);
  const [insight, setInsight] = useState<ProductivityInsight | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [taskLoadingId, setTaskLoadingId] = useState<string | null>(null);
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["productivity-workspace", submittedQuery],
    queryFn: () => workspaceSnapshot(submittedQuery),
  });

  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }), [locale]);
  const emails = data?.smartInbox.emails ?? [];
  const summaryCards = [
    { Icon: Inbox, value: data?.smartInbox.emails.length ?? 0, label: t("workspace.importantMessages") },
    { Icon: ListTodo, value: data?.overdueTasks.length ?? 0, label: t("workspace.overdueTasks") },
    { Icon: CalendarDays, value: data?.upcomingEvents.length ?? 0, label: t("workspace.upcomingMeetings") },
    { Icon: Mail, value: data?.drafts.length ?? 0, label: t("workspace.drafts") },
    { Icon: TimerReset, value: data?.followUps.length ?? 0, label: t("workspace.followUps") },
  ];

  const reasonLabel = (reason: string) => {
    const translated = t(`workspace.reason.${reason}`);
    return translated === `workspace.reason.${reason}` ? reason.replaceAll("_", " ") : translated;
  };

  const openEmail = (id: string) => setLocation(`/?email=${encodeURIComponent(id)}`);

  const saveFollowUp = async (emailId: string) => {
    if (!followUpAt) return;
    setActionError(null);
    try {
      await createFollowUp({ emailId, remindAt: new Date(followUpAt).toISOString() });
      setFollowUpEmailId(null);
      setFollowUpAt("");
      await refetch();
    } catch (saveError) {
      setActionError(saveError instanceof Error ? saveError.message : t("workspace.actionFailed"));
    }
  };

  const completeTask = async (id: string) => {
    setActionError(null);
    try {
      await updateTask(id, { status: "completed" });
      await refetch();
    } catch (taskError) {
      setActionError(taskError instanceof Error ? taskError.message : t("workspace.actionFailed"));
    }
  };

  const convertToTask = async (emailId: string, subject: string, bodyText: string) => {
    setTaskLoadingId(emailId);
    setActionError(null);
    try {
      await createTask({ title: subject || t("workspace.noSubject"), notes: bodyText, emailId, priority: "normal" });
      await refetch();
    } catch (taskError) {
      setActionError(taskError instanceof Error ? taskError.message : t("workspace.actionFailed"));
    } finally {
      setTaskLoadingId(null);
    }
  };

  const loadInsights = async (emailId: string) => {
    setInsightFor(emailId);
    setInsight(null);
    setInsightLoading(true);
    setActionError(null);
    try {
      setInsight(await aiProductivityInsights(emailId));
    } catch (insightError) {
      setActionError(insightError instanceof Error ? insightError.message : t("workspace.aiUnavailable"));
    } finally {
      setInsightLoading(false);
    }
  };

  const completeFollowUp = async (id: string) => {
    setActionError(null);
    try {
      await updateFollowUp(id, { status: "completed" });
      await refetch();
    } catch (followUpError) {
      setActionError(followUpError instanceof Error ? followUpError.message : t("workspace.actionFailed"));
    }
  };

  return (
    <div className="flex min-h-screen bg-background" dir="auto">
      <div className="hidden shrink-0 lg:block"><Sidebar currentFolder="workspace" /></div>
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8" dir="auto">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-5 rounded-3xl border border-border/60 bg-card p-5 shadow-sm sm:p-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <BrandMark />
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">{t("workspace.eyebrow")}</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">{t("workspace.title")}</h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">{t("workspace.subtitle")}</p>
            </div>
          </div>
          <div className="w-full max-w-xl space-y-2">
            <label htmlFor="workspace-search" className="text-sm font-semibold">{t("workspace.searchLabel")}</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input id="workspace-search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") setSubmittedQuery(query); }} placeholder={t("workspace.searchPlaceholder")} className="ps-9" />
              </div>
              <Button type="button" onClick={() => setSubmittedQuery(query)} disabled={isFetching}>
                {isFetching ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Search className="me-2 h-4 w-4" />}
                {t("workspace.search")}
              </Button>
            </div>
            {data?.smartInbox.queryPlan.filters.length ? (
              <div className="flex flex-wrap gap-2" aria-label={t("workspace.interpretedFilters")}>
                {data.smartInbox.queryPlan.filters.map((filter) => <Badge key={filter} variant="secondary">{filter}</Badge>)}
              </div>
            ) : null}
          </div>
        </header>

        {actionError ? <div role="alert" className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><AlertCircle className="h-4 w-4" />{actionError}</div> : null}
        {error ? <div role="alert" className="flex items-center justify-between rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><span className="flex items-center gap-2"><AlertCircle className="h-4 w-4" />{t("workspace.loadError")}</span><Button variant="outline" size="sm" onClick={() => void refetch()}>{t("workspace.retry")}</Button></div> : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5" aria-label={t("workspace.overview")}>
          {summaryCards.map(({ Icon, value, label }) => <Card key={label} className="border-border/60"><CardContent className="flex items-center gap-3 p-5"><span className="rounded-xl bg-primary/10 p-2.5 text-primary"><Icon className="h-5 w-5" /></span><span><strong className="block text-2xl">{isLoading ? "…" : value}</strong><span className="text-sm text-muted-foreground">{label}</span></span></CardContent></Card>)}
        </section>

        {insightFor ? <Card className="border-primary/20 bg-primary/[0.03] shadow-sm"><CardHeader className="flex flex-row items-start justify-between gap-4"><div><CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />{t("workspace.aiInsights")}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{t("workspace.aiInsightsHint")}</p></div>{insightLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label={t("workspace.loading")} /> : null}</CardHeader><CardContent>{insightLoading ? <p className="text-sm text-muted-foreground">{t("workspace.loading")}</p> : insight ? <div className="grid gap-4 md:grid-cols-[1.4fr_1fr_1fr]"><div><p className="text-sm font-semibold">{t("workspace.summary")}</p><p className="mt-1 text-sm text-muted-foreground" dir="auto">{insight.summary || t("workspace.noSummary")}</p></div><div><p className="text-sm font-semibold">{t("workspace.suggestedReply")}</p><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground" dir="auto">{insight.suggestedReply || t("workspace.noSuggestedReply")}</p></div><div><p className="text-sm font-semibold">{t("workspace.aiSignals")}</p><div className="mt-2 flex flex-wrap gap-2"><Badge variant="secondary">{t(`workspace.priority.${insight.priority}`)}</Badge>{insight.needsFollowUp ? <Badge variant="outline">{t("workspace.followUpRecommended")}</Badge> : null}<Badge variant="outline">{Math.round(insight.confidence * 100)}%</Badge></div>{insight.tasks.length ? <ul className="mt-3 list-inside list-disc text-sm text-muted-foreground">{insight.tasks.map((task) => <li key={`${task.title}-${task.dueAt ?? "none"}`}>{task.title}</li>)}</ul> : null}</div></div> : <p className="text-sm text-muted-foreground">{t("workspace.aiUnavailable")}</p>}</CardContent></Card> : null}

        <div className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between gap-4"><div><CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />{t("workspace.smartInbox")}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{t("workspace.smartInboxHint")}</p></div>{isFetching ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label={t("workspace.loading")} /> : null}</CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("workspace.loading")}</div> : null}
              {!isLoading && emails.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("workspace.noImportantMessages")}</div> : null}
              {emails.slice(0, 12).map(({ email, score, reasons }) => <article key={email.id} className="rounded-2xl border border-border/60 p-4 transition-colors hover:bg-muted/40"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><button type="button" onClick={() => openEmail(email.id)} className="min-w-0 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><span className="flex items-center gap-2"><span className="truncate font-semibold">{email.subject || t("workspace.noSubject")}</span><Badge variant="outline">{score}</Badge></span><span className="mt-1 block truncate text-sm text-muted-foreground" dir="auto">{email.fromEmail}</span><span className="mt-2 line-clamp-2 text-sm text-muted-foreground" dir="auto">{email.bodyText}</span></button><div className="flex shrink-0 items-center gap-2"><time className="text-xs text-muted-foreground" dateTime={email.createdAt}>{formatDate(email.createdAt, locale)}</time><Button size="sm" variant="ghost" onClick={() => void loadInsights(email.id)} disabled={insightLoading && insightFor === email.id}><Sparkles className="me-1 h-3.5 w-3.5" />{t("workspace.aiAction")}</Button><Button size="sm" variant="ghost" onClick={() => void convertToTask(email.id, email.subject, email.bodyText)} disabled={taskLoadingId === email.id}>{taskLoadingId === email.id ? <Loader2 className="me-1 h-3.5 w-3.5 animate-spin" /> : <ListTodo className="me-1 h-3.5 w-3.5" />}{t("workspace.createTask")}</Button><Button size="sm" variant="outline" onClick={() => setFollowUpEmailId(followUpEmailId === email.id ? null : email.id)}>
<TimerReset className="me-1 h-3.5 w-3.5" />{t("workspace.followUp")}</Button>
</div></div><div className="mt-3 flex flex-wrap gap-1.5">{reasons.map((reason) => <Badge key={reason} variant="secondary">{reasonLabel(reason)}</Badge>)}</div>{followUpEmailId === email.id ? <div className="mt-3 flex flex-col gap-2 rounded-xl bg-muted/50 p-3 sm:flex-row sm:items-end"><label className="flex-1 text-xs font-semibold">{t("workspace.remindAt")}<Input type="datetime-local" value={followUpAt} min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)} onChange={(event) => setFollowUpAt(event.target.value)} className="mt-1" /></label><Button size="sm" onClick={() => void saveFollowUp(email.id)} disabled={!followUpAt}>{t("workspace.saveReminder")}</Button></div> : null}</article>)}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="border-border/60"><CardHeader><CardTitle className="flex items-center gap-2"><ListTodo className="h-5 w-5 text-amber-500" />{t("workspace.overdueTasks")}</CardTitle></CardHeader><CardContent className="space-y-3">{data?.overdueTasks.length ? data.overdueTasks.map((task) => <div key={task.id} className="flex items-center justify-between gap-3 rounded-xl border p-3"><div className="min-w-0"><p className="truncate font-medium">{task.title}</p><p className="text-xs text-destructive">{formatDate(task.dueAt, locale)}</p></div><Button size="icon" variant="ghost" aria-label={t("workspace.completeTask")} onClick={() => void completeTask(task.id)}><CheckCircle2 className="h-4 w-4" /></Button></div>) : <p className="text-sm text-muted-foreground">{t("workspace.noOverdueTasks")}</p>}</CardContent></Card>
            <Card className="border-border/60"><CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-emerald-500" />{t("workspace.upcomingMeetings")}</CardTitle></CardHeader><CardContent className="space-y-3">{data?.upcomingEvents.length ? data.upcomingEvents.slice(0, 5).map((event) => <button type="button" key={event.id} className="flex w-full items-start justify-between gap-3 rounded-xl border p-3 text-start hover:bg-muted/40" onClick={() => event.emailId ? openEmail(event.emailId) : undefined}><span className="min-w-0"><span className="block truncate font-medium">{event.title}</span><span className="mt-1 block text-xs text-muted-foreground">{dateFormatter.format(new Date(event.startsAt))}</span></span><ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" /></button>) : <p className="text-sm text-muted-foreground">{t("workspace.noUpcomingMeetings")}</p>}</CardContent></Card>
            <Card className="border-border/60"><CardHeader><CardTitle className="flex items-center gap-2"><Clock3 className="h-5 w-5 text-violet-500" />{t("workspace.followUps")}</CardTitle></CardHeader><CardContent className="space-y-3">{data?.followUps.length ? data.followUps.slice(0, 5).map((followUp) => <div key={followUp.id} className="flex items-center justify-between gap-3 rounded-xl border p-3"><button type="button" className="min-w-0 text-start" onClick={() => openEmail(followUp.emailId)}><span className="block truncate font-medium">{followUp.emailSubject || t("workspace.noSubject")}</span><span className="block truncate text-xs text-muted-foreground">{followUp.fromEmail} · {formatDate(followUp.remindAt, locale)}</span></button><Button size="icon" variant="ghost" aria-label={t("workspace.completeFollowUp")} onClick={() => void completeFollowUp(followUp.id)}><CheckCircle2 className="h-4 w-4" /></Button></div>) : <p className="text-sm text-muted-foreground">{t("workspace.noFollowUps")}</p>}</CardContent></Card>
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground"><span>{t("workspace.dataNote")}</span><Button variant="ghost" size="sm" onClick={() => setLocation("/")}><ArrowUpRight className="me-1 h-4 w-4" />{t("workspace.openInbox")}</Button></footer>
      </div>
      </main>
    </div>
  );
}
