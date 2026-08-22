import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowUpRight,
  Bookmark,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Inbox,
  ListTodo,
  Loader2,
  Mail,
  Search,
  SlidersHorizontal,
  Sparkles,
  TimerReset,
  X,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/hooks/use-i18n";
import {
  aiProductivityInsights,
  createFollowUp,
  createTask,
  getWorkspacePreferences,
  updateFollowUp,
  updateTask,
  updateWorkspacePreferences,
  workspaceSnapshot,
  type ProductivityInsight,
} from "@/lib/feature-api";

function formatDate(
  value: string | null | undefined,
  locale: string,
  options: Intl.DateTimeFormatOptions = {},
) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", ...options }).format(date);
}

function WorkspacePanelState({
  isLoading,
  isOffline,
  hasError,
  emptyText,
  loadingLabel,
  offlineLabel,
  errorLabel,
  retryLabel,
  onRetry,
}: {
  isLoading: boolean;
  isOffline: boolean;
  hasError: boolean;
  emptyText: string;
  loadingLabel: string;
  offlineLabel: string;
  errorLabel: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  if (isOffline) {
    return <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-100" role="status">{offlineLabel}</p>;
  }
  if (isLoading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label={loadingLabel}>
        <div className="novamail-workspace-skeleton" />
        <div className="novamail-workspace-skeleton" />
      </div>
    );
  }
  if (hasError) {
    return (
      <div className="novamail-feedback-error flex items-center justify-between gap-3 rounded-xl border p-3 text-sm" role="alert">
        <span>{errorLabel}</span>
        <Button variant="outline" size="sm" onClick={onRetry}>{retryLabel}</Button>
      </div>
    );
  }
  return <p className="text-sm text-muted-foreground">{emptyText}</p>;
}

export default function Workspace() {
  const [, setLocation] = useLocation();
  const { t, locale } = useI18n();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [senderFilter, setSenderFilter] = useState("");
  const [fromDateFilter, setFromDateFilter] = useState("");
  const [toDateFilter, setToDateFilter] = useState("");
  const [attachmentsFilter, setAttachmentsFilter] = useState(false);
  const [tasksFilter, setTasksFilter] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState("");
  const [folderFilter, setFolderFilter] = useState("");
  const [followUpEmailId, setFollowUpEmailId] = useState<string | null>(null);
  const [followUpAt, setFollowUpAt] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [insightFor, setInsightFor] = useState<string | null>(null);
  const [insight, setInsight] = useState<ProductivityInsight | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [taskLoadingId, setTaskLoadingId] = useState<string | null>(null);
  const [inboxLayout, setInboxLayout] = useState<"two-pane" | "list" | "split">("two-pane");
  const [accentColor, setAccentColor] = useState("indigo");
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  const [visibleColumns, setVisibleColumns] = useState<string[]>([
    "sender",
    "subject",
    "date",
    "priority",
  ]);
  const [preferencesHydrated, setPreferencesHydrated] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [density, setDensity] = useState<"comfortable" | "compact">(() => {
    if (typeof window === "undefined") return "comfortable";
    return window.localStorage.getItem("zephyx.workspace.density") === "compact"
      ? "compact"
      : "comfortable";
  });
  const [showTaskPanel, setShowTaskPanel] = useState(true);
  const [showDraftPanel, setShowDraftPanel] = useState(true);
  const [customizationOpen, setCustomizationOpen] = useState(false);
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);
  const [savedSearches, setSavedSearches] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = JSON.parse(
        window.localStorage.getItem("zephyx.workspace.saved-searches") ?? "[]",
      );
      return Array.isArray(saved)
        ? saved.filter((item): item is string => typeof item === "string")
        : [];
    } catch {
      return [];
    }
  });
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["productivity-workspace", submittedQuery],
    queryFn: () => workspaceSnapshot(submittedQuery),
  });
  const preferencesQuery = useQuery({
    queryKey: ["workspace-preferences"],
    queryFn: getWorkspacePreferences,
  });
  const preferencesMutation = useMutation({
    mutationFn: updateWorkspacePreferences,
    onError: () => setActionError(t("workspace.preferencesSaveFailed")),
  });
  const savePreferences = preferencesMutation.mutate;
  const preferencesSaving = preferencesMutation.isPending;

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }),
    [locale],
  );

  useEffect(() => {
    if (!preferencesQuery.data || preferencesHydrated) return;
    setDensity(preferencesQuery.data.inboxDensity);
    setInboxLayout(preferencesQuery.data.inboxLayout);
    setAccentColor(preferencesQuery.data.accentColor);
    setTheme(preferencesQuery.data.theme);
    setVisibleColumns(
      preferencesQuery.data.visibleColumns.length
        ? preferencesQuery.data.visibleColumns
        : ["sender", "subject", "date", "priority"],
    );
    setSavedSearches(preferencesQuery.data.savedSearches);
    setShowTaskPanel(
      preferencesQuery.data.visibleSections.includes("tasks") ||
        !preferencesQuery.data.visibleSections.length,
    );
    setShowDraftPanel(
      preferencesQuery.data.visibleSections.includes("drafts") ||
        !preferencesQuery.data.visibleSections.length,
    );
    setPreferencesHydrated(true);
  }, [preferencesHydrated, preferencesQuery.data]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("zephyx.workspace.density", density);
      window.localStorage.setItem("zephyx.workspace.saved-searches", JSON.stringify(savedSearches));
    }
  }, [density, savedSearches]);

  useEffect(() => {
    if (!preferencesHydrated) return;
    const visibleSections = [
      showTaskPanel ? "tasks" : "",
      showDraftPanel ? "drafts" : "",
      "follow_ups",
      "smart_inbox",
    ].filter(Boolean);
    savePreferences({
      inboxDensity: density,
      inboxLayout,
      accentColor,
      theme,
      visibleColumns,
      visibleSections,
      savedSearches,
    });
  }, [
    accentColor,
    density,
    inboxLayout,
    preferencesHydrated,
    savePreferences,
    savedSearches,
    showDraftPanel,
    showTaskPanel,
    theme,
    visibleColumns,
  ]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () =>
      root.classList.toggle("dark", theme === "dark" || (theme === "system" && media.matches));
    root.dataset.zephyxTheme = theme;
    root.dataset.zephyxAccent = accentColor;
    root.dataset.zephyxInboxLayout = inboxLayout;
    applyTheme();
    media.addEventListener?.("change", applyTheme);
    return () => {
      media.removeEventListener?.("change", applyTheme);
      delete root.dataset.zephyxTheme;
      delete root.dataset.zephyxAccent;
      delete root.dataset.zephyxInboxLayout;
    };
  }, [accentColor, inboxLayout, theme]);

  useEffect(() => {
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if (
        (event.key === "/" ||
          (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey))) &&
        !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);
  const emails = data?.smartInbox.emails ?? [];
  const openFollowUps = data?.followUps.filter((followUp) => followUp.status === "open") ?? [];
  const waitingFollowUps = openFollowUps.filter((followUp) => followUp.waitingForReply);
  const importantEmails = emails.filter(({ reasons }) =>
    reasons.some((reason) => ["starred", "primary", "label"].includes(reason)),
  );
  const applyFilters = () => {
    const parts = [
      query.trim(),
      senderFilter.trim() ? `from:${senderFilter.trim()}` : "",
      fromDateFilter ? `after:${fromDateFilter}` : "",
      toDateFilter ? `before:${toDateFilter}` : "",
      attachmentsFilter ? "attachments" : "",
      tasksFilter ? "task" : "",
      priorityFilter ? `priority:${priorityFilter}` : "",
      folderFilter ? `folder:${folderFilter}` : "",
    ].filter(Boolean);
    const nextQuery = parts.join(" ");
    setQuery(nextQuery);
    setSubmittedQuery(nextQuery);
  };

  const clearFilters = () => {
    setSenderFilter("");
    setFromDateFilter("");
    setToDateFilter("");
    setAttachmentsFilter(false);
    setTasksFilter(false);
    setPriorityFilter("");
    setFolderFilter("");
    setQuery("");
    setSubmittedQuery("");
  };

  const saveSearch = () => {
    const normalized = query.trim();
    if (!normalized) return;
    if (savedSearches.includes(normalized)) {
      setActionError(t("workspace.searchAlreadySaved"));
      return;
    }
    setSavedSearches((current) => [...current, normalized].slice(-8));
    setActionError(null);
  };
  const removeSavedSearch = (search: string) =>
    setSavedSearches((current) => current.filter((item) => item !== search));
  const summaryCards = [
    { Icon: Inbox, value: importantEmails.length, label: t("workspace.importantMessages") },
    { Icon: ListTodo, value: data?.overdueTasks.length ?? 0, label: t("workspace.overdueTasks") },
    {
      Icon: CalendarDays,
      value: data?.upcomingEvents.length ?? 0,
      label: t("workspace.upcomingMeetings"),
    },
    { Icon: Mail, value: data?.drafts.length ?? 0, label: t("workspace.drafts") },
    { Icon: TimerReset, value: waitingFollowUps.length, label: t("workspace.needsReply") },
    { Icon: Clock3, value: data?.followUps.length ?? 0, label: t("workspace.followUps") },
  ];

  const reasonLabel = (reason: string) => {
    const keys: Record<string, string> = {
      unread: "workspace.reasonUnread",
      starred: "workspace.reasonStarred",
      primary: "workspace.reasonPrimary",
      deadline: "workspace.reasonDeadline",
      follow_up: "workspace.reasonFollowUp",
      meeting: "workspace.reasonMeeting",
      personal: "workspace.reasonPersonal",
      deadline_or_action: "workspace.reasonDeadlineOrAction",
      work_context: "workspace.reasonWorkContext",
      label: "workspace.reasonLabel",
    };
    const key = keys[reason];
    const translated = key ? t(key) : reason.replaceAll("_", " ");
    return translated === key ? reason.replaceAll("_", " ") : translated;
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
      await createTask({
        title: subject || t("workspace.noSubject"),
        notes: bodyText,
        emailId,
        priority: "normal",
      });
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
      setActionError(
        insightError instanceof Error ? insightError.message : t("workspace.aiUnavailable"),
      );
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
      setActionError(
        followUpError instanceof Error ? followUpError.message : t("workspace.actionFailed"),
      );
    }
  };

  const snoozeFollowUp = async (id: string, remindAt: string) => {
    setActionError(null);
    try {
      const nextReminder = new Date(
        Math.max(
          Date.now() + 24 * 60 * 60 * 1000,
          new Date(remindAt).getTime() + 24 * 60 * 60 * 1000,
        ),
      ).toISOString();
      await updateFollowUp(id, { status: "snoozed", remindAt: nextReminder });
      setActionError(t("workspace.followUpSnoozed"));
      await refetch();
    } catch (followUpError) {
      setActionError(
        followUpError instanceof Error ? followUpError.message : t("workspace.actionFailed"),
      );
    }
  };

  return (
    <div
      className={`flex min-h-screen bg-background novamail-workspace-density-${density}`}
      dir="auto"
    >
      <div className="hidden shrink-0 lg:block">
        <Sidebar currentFolder="workspace" />
      </div>
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8" dir="auto">
        <div className="mx-auto max-w-7xl space-y-6">
          {isOffline ? (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100" role="status">
              {t("workspace.offlineNotice")}
            </div>
          ) : null}
          <header className="flex flex-col gap-5 rounded-3xl border border-border/60 bg-card p-5 shadow-sm sm:p-7 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <BrandMark />
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">
                  {t("workspace.eyebrow")}
                </p>
                <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
                  {t("workspace.title")}
                </h1>
                <p className="mt-2 max-w-2xl text-muted-foreground">{t("workspace.subtitle")}</p>
              </div>
            </div>
            <div className="w-full max-w-xl space-y-2">
              <label htmlFor="workspace-search" className="text-sm font-semibold">
                {t("workspace.searchLabel")}
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search
                    className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    ref={searchInputRef}
                    id="workspace-search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") setSubmittedQuery(query);
                    }}
                    placeholder={t("workspace.searchPlaceholder")}
                    className="ps-9"
                  />
                </div>
                <Button
                  type="button"
                  onClick={() => setSubmittedQuery(query)}
                  disabled={isFetching}
                >
                  {isFetching ? (
                    <Loader2 className="me-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="me-2 h-4 w-4" />
                  )}
                  {t("workspace.search")}
                </Button>
              </div>
              <details className="rounded-xl border border-border/60 bg-background">
                <summary className="cursor-pointer list-none px-3 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  {t("workspace.filters")}
                </summary>
                <div className="grid gap-3 border-t border-border/60 p-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-xs font-semibold" htmlFor="workspace-sender">
                    <span>{t("workspace.sender")}</span>
                    <Input
                      id="workspace-sender"
                      value={senderFilter}
                      onChange={(event) => setSenderFilter(event.target.value)}
                      placeholder={t("workspace.senderPlaceholder")}
                      dir="ltr"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold" htmlFor="workspace-from-date">
                    <span>{t("workspace.fromDate")}</span>
                    <Input
                      id="workspace-from-date"
                      type="date"
                      value={fromDateFilter}
                      onChange={(event) => setFromDateFilter(event.target.value)}
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold" htmlFor="workspace-to-date">
                    <span>{t("workspace.toDate")}</span>
                    <Input
                      id="workspace-to-date"
                      type="date"
                      value={toDateFilter}
                      onChange={(event) => setToDateFilter(event.target.value)}
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold" htmlFor="workspace-priority">
                    <span>{t("workspace.priority")}</span>
                    <select
                      id="workspace-priority"
                      value={priorityFilter}
                      onChange={(event) => setPriorityFilter(event.target.value)}
                      className="h-10 rounded-md border border-input bg-background px-3"
                    >
                      <option value="">{t("workspace.anyPriority")}</option>
                      <option value="high">{t("workspace.priorityHigh")}</option>
                      <option value="normal">{t("workspace.priorityNormal")}</option>
                      <option value="low">{t("workspace.priorityLow")}</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-semibold" htmlFor="workspace-folder">
                    <span>{t("workspace.folder")}</span>
                    <select
                      id="workspace-folder"
                      value={folderFilter}
                      onChange={(event) => setFolderFilter(event.target.value)}
                      className="h-10 rounded-md border border-input bg-background px-3"
                    >
                      <option value="">{t("workspace.anyFolder")}</option>
                      <option value="inbox">{t("workspace.folderInbox")}</option>
                      <option value="sent">{t("workspace.folderSent")}</option>
                      <option value="archive">{t("workspace.folderArchive")}</option>
                      <option value="trash">{t("workspace.folderTrash")}</option>
                      <option value="drafts">{t("workspace.folderDrafts")}</option>
                      <option value="spam">{t("workspace.folderSpam")}</option>
                    </select>
                  </label>
                  <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
                    <label className="flex items-center gap-2 text-xs font-semibold">
                      <input
                        type="checkbox"
                        checked={attachmentsFilter}
                        onChange={(event) => setAttachmentsFilter(event.target.checked)}
                      />
                      {t("workspace.attachmentsOnly")}
                    </label>
                    <label className="flex items-center gap-2 text-xs font-semibold">
                      <input
                        type="checkbox"
                        checked={tasksFilter}
                        onChange={(event) => setTasksFilter(event.target.checked)}
                      />
                      {t("workspace.tasksOnly")}
                    </label>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
                    <Button type="button" size="sm" onClick={applyFilters}>
                      {t("workspace.applyFilters")}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={clearFilters}>
                      {t("workspace.clearFilters")}
                    </Button>
                  </div>
                </div>
              </details>
              {data?.smartInbox.queryPlan.filters.length ? (
                <div
                  className="flex flex-wrap gap-2"
                  aria-label={t("workspace.interpretedFilters")}
                >
                  {data.smartInbox.queryPlan.filters.map((filter) => (
                    <Badge key={filter} variant="secondary">
                      {filter}
                    </Badge>
                  ))}
                </div>
              ) : null}
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={saveSearch}
                  disabled={!query.trim()}
                >
                  <Bookmark className="me-2 h-4 w-4" />
                  {t("workspace.saveCurrentSearch")}
                </Button>
                <Button
                  type="button"
                  variant={customizationOpen ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCustomizationOpen((open) => !open)}
                >
                  <SlidersHorizontal className="me-2 h-4 w-4" />
                  {t("workspace.customize")}
                </Button>
              </div>
            </div>
          </header>

          {customizationOpen ? (
            <Card
              className="border-primary/20 bg-primary/[0.03]"
              aria-label={t("workspace.customize")}
            >
              <CardContent className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-4">
                <label className="grid gap-1 text-sm font-medium">
                  <span>{t("workspace.density")}</span>
                  <select
                    value={density}
                    onChange={(event) =>
                      setDensity(event.target.value === "compact" ? "compact" : "comfortable")
                    }
                    className="h-10 rounded-md border border-input bg-background px-3"
                  >
                    <option value="comfortable">{t("workspace.densityComfortable")}</option>
                    <option value="compact">{t("workspace.densityCompact")}</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  <span>{t("workspace.layout")}</span>
                  <select
                    value={inboxLayout}
                    onChange={(event) =>
                      setInboxLayout(event.target.value as "two-pane" | "list" | "split")
                    }
                    className="h-10 rounded-md border border-input bg-background px-3"
                  >
                    <option value="two-pane">{t("workspace.layoutTwoPane")}</option>
                    <option value="list">{t("workspace.layoutList")}</option>
                    <option value="split">{t("workspace.layoutSplit")}</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  <span>{t("workspace.theme")}</span>
                  <select
                    value={theme}
                    onChange={(event) =>
                      setTheme(event.target.value as "light" | "dark" | "system")
                    }
                    className="h-10 rounded-md border border-input bg-background px-3"
                  >
                    <option value="system">{t("workspace.themeSystem")}</option>
                    <option value="light">{t("workspace.themeLight")}</option>
                    <option value="dark">{t("workspace.themeDark")}</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  <span>{t("workspace.accentColor")}</span>
                  <select
                    value={accentColor}
                    onChange={(event) => setAccentColor(event.target.value)}
                    className="h-10 rounded-md border border-input bg-background px-3"
                  >
                    <option value="indigo">{t("workspace.accentIndigo")}</option>
                    <option value="violet">{t("workspace.accentViolet")}</option>
                    <option value="emerald">{t("workspace.accentEmerald")}</option>
                    <option value="amber">{t("workspace.accentAmber")}</option>
                    <option value="rose">{t("workspace.accentRose")}</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={showTaskPanel}
                    onChange={(event) => setShowTaskPanel(event.target.checked)}
                  />
                  {t("workspace.showTaskPanel")}
                </label>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={showDraftPanel}
                    onChange={(event) => setShowDraftPanel(event.target.checked)}
                  />
                  {t("workspace.showDraftPanel")}
                </label>
                <fieldset className="grid gap-2 text-sm font-medium sm:col-span-2">
                  <legend>{t("workspace.columns")}</legend>
                  <div className="flex flex-wrap gap-3">
                    {["sender", "subject", "date", "priority"].map((column) => (
                      <label key={column} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={visibleColumns.includes(column)}
                          onChange={(event) =>
                            setVisibleColumns((current) =>
                              event.target.checked
                                ? Array.from(new Set([...current, column]))
                                : current.filter((item) => item !== column),
                            )
                          }
                        />
                        {t(`workspace.column${column.charAt(0).toUpperCase()}${column.slice(1)}`)}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </CardContent>
            </Card>
          ) : null}

          {savedSearches.length || customizationOpen ? (
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t("workspace.savedSearches")}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {savedSearches.length ? (
                  savedSearches.map((saved) => (
                    <span
                      key={saved}
                      className="inline-flex max-w-full items-center gap-1 rounded-full border bg-background px-3 py-1 text-xs"
                    >
                      <button
                        type="button"
                        className="max-w-[18rem] truncate text-start hover:text-primary"
                        onClick={() => {
                          setQuery(saved);
                          setSubmittedQuery(saved);
                        }}
                      >
                        {saved}
                      </button>
                      <button
                        type="button"
                        className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label={`${t("workspace.removeSavedSearch")}: ${saved}`}
                        onClick={() => removeSavedSearch(saved)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">{t("workspace.noSavedSearches")}</p>
                )}
              </CardContent>
            </Card>
          ) : null}

          {actionError ? (
            <div
              role="alert"
              className="novamail-feedback-error flex items-center gap-2 rounded-xl border p-3 text-sm"
            >
              <AlertCircle className="h-4 w-4" />
              {actionError}
            </div>
          ) : null}
          {preferencesSaving ? (
            <p className="text-xs text-muted-foreground" role="status">
              {t("workspace.savingPreferences")}
            </p>
          ) : null}
          {error ? (
            <div
              role="alert"
              className="novamail-feedback-error flex items-center justify-between rounded-xl border p-3 text-sm"
            >
              <span className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                {t("workspace.loadError")}
              </span>
              <Button variant="outline" size="sm" onClick={() => void refetch()}>
                {t("workspace.retry")}
              </Button>
            </div>
          ) : null}

          <section
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6"
            aria-label={t("workspace.overview")}
          >
            {summaryCards.map(({ Icon, value, label }) => (
              <Card key={label} className="border-border/60">
                <CardContent className="flex items-center gap-3 p-5">
                  <span className="rounded-xl bg-primary/10 p-2.5 text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span>
                    <strong className="block text-2xl">{isLoading ? "…" : value}</strong>
                    <span className="text-sm text-muted-foreground">{label}</span>
                  </span>
                </CardContent>
              </Card>
            ))}
          </section>

          {insightFor ? (
            <Card className="border-primary/20 bg-primary/[0.03] shadow-sm">
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    {t("workspace.aiInsights")}
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("workspace.aiInsightsHint")}
                  </p>
                </div>
                {insightLoading ? (
                  <Loader2
                    className="h-4 w-4 animate-spin text-muted-foreground"
                    aria-label={t("workspace.loading")}
                  />
                ) : null}
              </CardHeader>
              <CardContent>
                {insightLoading ? (
                  <p className="text-sm text-muted-foreground">{t("workspace.loading")}</p>
                ) : insight ? (
                  <div className="grid gap-4 md:grid-cols-[1.4fr_1fr_1fr]">
                    <div>
                      <p className="text-sm font-semibold">{t("workspace.summary")}</p>
                      <p className="mt-1 text-sm text-muted-foreground" dir="auto">
                        {insight.summary || t("workspace.noSummary")}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{t("workspace.suggestedReply")}</p>
                      <p
                        className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground"
                        dir="auto"
                      >
                        {insight.suggestedReply || t("workspace.noSuggestedReply")}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{t("workspace.aiSignals")}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant="secondary">
                          {insight.priority === "low"
                            ? t("workspace.priorityLow")
                            : insight.priority === "high"
                              ? t("workspace.priorityHigh")
                              : t("workspace.priorityNormal")}
                        </Badge>
                        {insight.needsFollowUp ? (
                          <Badge variant="outline">{t("workspace.followUpRecommended")}</Badge>
                        ) : null}
                        <Badge variant="outline">{Math.round(insight.confidence * 100)}%</Badge>
                      </div>
                      {insight.tasks.length ? (
                        <ul className="mt-3 list-inside list-disc text-sm text-muted-foreground">
                          {insight.tasks.map((task) => (
                            <li key={`${task.title}-${task.dueAt ?? "none"}`}>{task.title}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("workspace.aiUnavailable")}</p>
                )}
              </CardContent>
            </Card>
          ) : null}

          <div className="novamail-workspace-grid grid gap-6 xl:grid-cols-[1.45fr_1fr]">
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    {t("workspace.smartInbox")}
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("workspace.smartInboxHint")}
                  </p>
                </div>
                {isFetching ? (
                  <Loader2
                    className="h-4 w-4 animate-spin text-muted-foreground"
                    aria-label={t("workspace.loading")}
                  />
                ) : null}
              </CardHeader>
              <CardContent className={density === "compact" ? "space-y-2" : "space-y-3"}>
                {!data || error ? (
                  <WorkspacePanelState
                    isLoading={isLoading}
                    isOffline={isOffline}
                    hasError={Boolean(error)}
                    emptyText={t("workspace.noImportantMessages")}
                    loadingLabel={t("workspace.loading")}
                    offlineLabel={t("workspace.offlineNotice")}
                    errorLabel={t("workspace.cardLoadError")}
                    retryLabel={t("workspace.retry")}
                    onRetry={() => void refetch()}
                  />
                ) : emails.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                    {t("workspace.noImportantMessages")}
                  </div>
                ) : (
                  emails.slice(0, 12).map(({ email, score, reasons }) => (
                  <article
                    key={email.id}
                    className="rounded-2xl border border-border/60 p-4 transition-colors hover:bg-muted/40"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <button
                        type="button"
                        onClick={() => openEmail(email.id)}
                        className="min-w-0 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <span className="flex items-center gap-2">
                          <span className="truncate font-semibold">
                            {email.subject || t("workspace.noSubject")}
                          </span>
                          <Badge variant="outline">{score}</Badge>
                        </span>
                        <span
                          className="mt-1 block truncate text-sm text-muted-foreground"
                          dir="auto"
                        >
                          {email.fromEmail}
                        </span>
                        <span
                          className="mt-2 line-clamp-2 text-sm text-muted-foreground"
                          dir="auto"
                        >
                          {email.bodyText}
                        </span>
                      </button>
                      <div className="flex shrink-0 items-center gap-2">
                        <time className="text-xs text-muted-foreground" dateTime={email.createdAt}>
                          {formatDate(email.createdAt, locale)}
                        </time>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void loadInsights(email.id)}
                          disabled={insightLoading && insightFor === email.id}
                        >
                          <Sparkles className="me-1 h-3.5 w-3.5" />
                          {t("workspace.aiAction")}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            void convertToTask(email.id, email.subject, email.bodyText)
                          }
                          disabled={taskLoadingId === email.id}
                        >
                          {taskLoadingId === email.id ? (
                            <Loader2 className="me-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <ListTodo className="me-1 h-3.5 w-3.5" />
                          )}
                          {t("workspace.createTask")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setFollowUpEmailId(followUpEmailId === email.id ? null : email.id)
                          }
                        >
                          <TimerReset className="me-1 h-3.5 w-3.5" />
                          {t("workspace.followUp")}
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {reasons.map((reason) => (
                        <Badge key={reason} variant="secondary">
                          {reasonLabel(reason)}
                        </Badge>
                      ))}
                    </div>
                    {followUpEmailId === email.id ? (
                      <div className="mt-3 flex flex-col gap-2 rounded-xl bg-muted/50 p-3 sm:flex-row sm:items-end">
                        <label className="flex-1 text-xs font-semibold">
                          {t("workspace.remindAt")}
                          <Input
                            type="datetime-local"
                            value={followUpAt}
                            min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
                            onChange={(event) => setFollowUpAt(event.target.value)}
                            className="mt-1"
                          />
                        </label>
                        <Button
                          size="sm"
                          onClick={() => void saveFollowUp(email.id)}
                          disabled={!followUpAt}
                        >
                          {t("workspace.saveReminder")}
                        </Button>
                      </div>
                    ) : null}
                  </article>
                  ))
                )}
              </CardContent>
            </Card>

            <div className={density === "compact" ? "space-y-3" : "space-y-6"}>
              {showTaskPanel ? (
                <Card className="border-border/60">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ListTodo className="h-5 w-5 text-amber-500" />
                      {t("workspace.overdueTasks")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {!data || error ? (
                      <WorkspacePanelState
                        isLoading={isLoading}
                        isOffline={isOffline}
                        hasError={Boolean(error)}
                        emptyText={t("workspace.noOverdueTasks")}
                        loadingLabel={t("workspace.loading")}
                        offlineLabel={t("workspace.offlineNotice")}
                        errorLabel={t("workspace.cardLoadError")}
                        retryLabel={t("workspace.retry")}
                        onRetry={() => void refetch()}
                      />
                    ) : data.overdueTasks.length ? (
                      data.overdueTasks.map((task) => (
                        <div key={task.id} data-task-id={task.id} data-email-id={task.emailId ?? undefined} className="flex items-center justify-between gap-3 rounded-xl border p-3">
                          {task.emailId ? (
                            <button type="button" className="min-w-0 text-start" onClick={() => openEmail(task.emailId!)}>
                              <span className="block truncate font-medium">{task.title}</span>
                              <span className="text-xs text-destructive">{formatDate(task.dueAt, locale)}</span>
                            </button>
                          ) : (
                            <div className="min-w-0">
                              <p className="truncate font-medium">{task.title}</p>
                              <p className="text-xs text-destructive">{formatDate(task.dueAt, locale)}</p>
                            </div>
                          )}
                          <Button size="icon" variant="ghost" aria-label={t("workspace.completeTask")} onClick={() => void completeTask(task.id)}>
                            <CheckCircle2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">{t("workspace.noOverdueTasks")}</p>
                    )}
                  </CardContent>
                </Card>
              ) : null}
              <Card className="border-border/60">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarDays className="h-5 w-5 text-emerald-500" />
                    {t("workspace.upcomingMeetings")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {!data || error ? (
                    <WorkspacePanelState
                      isLoading={isLoading}
                      isOffline={isOffline}
                      hasError={Boolean(error)}
                      emptyText={t("workspace.noUpcomingMeetings")}
                      loadingLabel={t("workspace.loading")}
                      offlineLabel={t("workspace.offlineNotice")}
                      errorLabel={t("workspace.cardLoadError")}
                      retryLabel={t("workspace.retry")}
                      onRetry={() => void refetch()}
                    />
                  ) : data.upcomingEvents.length ? (
                    data.upcomingEvents.slice(0, 5).map((event) => (
                      <button
                        type="button"
                        key={event.id}
                        data-event-id={event.id}
                        data-email-id={event.emailId ?? undefined}
                        className="flex w-full items-start justify-between gap-3 rounded-xl border p-3 text-start hover:bg-muted/40"
                        onClick={() => (event.emailId ? openEmail(event.emailId) : undefined)}
                        disabled={!event.emailId}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{event.title}</span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {dateFormatter.format(new Date(event.startsAt))}
                          </span>
                        </span>
                        <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("workspace.noUpcomingMeetings")}</p>
                  )}
                </CardContent>
              </Card>
              {showDraftPanel ? (
                <Card className="border-border/60">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Mail className="h-5 w-5 text-sky-500" />
                      {t("workspace.draftsPanel")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {!data || error ? (
                      <WorkspacePanelState
                        isLoading={isLoading}
                        isOffline={isOffline}
                        hasError={Boolean(error)}
                        emptyText={t("workspace.noDrafts")}
                        loadingLabel={t("workspace.loading")}
                        offlineLabel={t("workspace.offlineNotice")}
                        errorLabel={t("workspace.cardLoadError")}
                        retryLabel={t("workspace.retry")}
                        onRetry={() => void refetch()}
                      />
                    ) : data.drafts.length ? (
                      data.drafts.slice(0, 5).map((draft) => (
                        <button
                          type="button"
                          key={draft.id}
                          data-draft-id={draft.id}
                          className="flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-start hover:bg-muted/40"
                          onClick={() => openEmail(draft.id)}
                        >
                          <span className="min-w-0 truncate font-medium">
                            {draft.subject || t("workspace.noSubject")}
                          </span>
                          <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </button>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">{t("workspace.noDrafts")}</p>
                    )}
                  </CardContent>
                </Card>
              ) : null}
              <Card className="border-border/60">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock3 className="h-5 w-5 text-violet-500" />
                    {t("workspace.followUpCenter")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {!data || error ? (
                    <WorkspacePanelState
                      isLoading={isLoading}
                      isOffline={isOffline}
                      hasError={Boolean(error)}
                      emptyText={t("workspace.noFollowUps")}
                      loadingLabel={t("workspace.loading")}
                      offlineLabel={t("workspace.offlineNotice")}
                      errorLabel={t("workspace.cardLoadError")}
                      retryLabel={t("workspace.retry")}
                      onRetry={() => void refetch()}
                    />
                  ) : data.followUps.length ? (
                    data.followUps.slice(0, 8).map((followUp) => (
                      <div key={followUp.id} data-follow-up-id={followUp.id} data-email-id={followUp.emailId} data-waiting-for-reply={followUp.waitingForReply ? "true" : "false"} className="rounded-xl border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <button type="button" className="min-w-0 text-start" onClick={() => openEmail(followUp.emailId)}>
                            <span className="block truncate font-medium">
                              {followUp.emailSubject || t("workspace.noSubject")}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {followUp.fromEmail} · {formatDate(followUp.remindAt, locale)}
                            </span>
                          </button>
                          <Badge variant={followUp.status === "open" ? "default" : "secondary"}>
                            {followUp.waitingForReply ? t("workspace.waitingForReply") : followUp.status}
                          </Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={() => void snoozeFollowUp(followUp.id, followUp.remindAt)}>
                            <Clock3 className="me-1 h-3.5 w-3.5" />
                            {t("workspace.snoozeFollowUp")}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => void completeFollowUp(followUp.id)}>
                            <CheckCircle2 className="me-1 h-3.5 w-3.5" />
                            {t("workspace.completeFollowUp")}
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("workspace.noFollowUps")}</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
            <span>{t("workspace.dataNote")}</span>
            <Button variant="ghost" size="sm" onClick={() => setLocation("/")}>
              <ArrowUpRight className="me-1 h-4 w-4" />
              {t("workspace.openInbox")}
            </Button>
          </footer>
        </div>
      </main>
    </div>
  );
}
