import React from "react";
import { isToday, isYesterday } from "date-fns";
import { Archive, Check, ListTodo, Star, Paperclip, Search } from "lucide-react";
import type { Email } from "@workspace/api-client-react";
import { getListEmailsQueryKey, useMarkEmailRead, useMoveEmail, useToggleEmailStar } from "@workspace/api-client-react";
import { updateEmailCategory, type EmailCategory } from "@/lib/feature-api";
import { useQueryClient } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useI18n } from "@/hooks/use-i18n";
import { getIntlLocale } from "@/lib/i18n-config";
import { cn } from "@/lib/utils";
import { createTask } from "@/lib/feature-api";

const LABEL_PRIORITY = [
  "UNREAD",
  "IMPORTANT",
  "CATEGORY_PERSONAL",
  "INBOX",
];

function getDisplayLabels(
  labels: string[] | null | undefined,
  isRead: boolean,
  _folder: string | null | undefined,
): string[] {
  const currentLabels = new Set(labels || []);
  const displayLabels: string[] = [];

  // Unread: only when the current message state is unread.
  if (!isRead) {
    displayLabels.push("UNREAD");
  }

  // Important: only when Gmail currently reports IMPORTANT.
  if (currentLabels.has("IMPORTANT")) {
    displayLabels.push("IMPORTANT");
  }

  // Personal: only when Gmail currently reports CATEGORY_PERSONAL.
  if (currentLabels.has("CATEGORY_PERSONAL")) {
    displayLabels.push("CATEGORY_PERSONAL");
  }

  // Inbox: only when Gmail currently reports INBOX.
  if (currentLabels.has("INBOX")) {
    displayLabels.push("INBOX");
  }

  return displayLabels;
}

type SmartSection = "all" | "important" | "followUp" | "work" | "meetings" | "deadlines" | "personal" | "unread";

type SmartSignals = {
  important: boolean;
  followUp: boolean;
  work: boolean;
  meeting: boolean;
  deadline: boolean;
  personal: boolean;
  unread: boolean;
};

function getSmartSignals(email: Email): SmartSignals {
  const labels = new Set(email.labels ?? []);
  const haystack = `${email.subject} ${email.bodyText}`;
  return {
    important: email.isStarred || labels.has("IMPORTANT") || email.category === "primary",
    followUp: labels.has("FOLLOW_UP") || /(follow[ -]?up|awaiting (a )?reply|needs? reply|متابعة|بانتظار الرد|回复|返事)/i.test(haystack),
    work: labels.has("CATEGORY_WORK") || /(project|client|invoice|work|proposal|project|مشروع|عميل|فاتورة|عمل|方案|プロジェクト)/i.test(haystack),
    meeting: /(meeting|calendar|appointment|invite|schedule|اجتماع|موعد|دعوة|会议|会議|미팅)/i.test(haystack),
    deadline: /(deadline|due|urgent|asap|action required|موعد نهائي|استحقاق|عاجل|مطلوب)/i.test(haystack),
    personal: email.category === "social" || labels.has("CATEGORY_PERSONAL") || /(family|personal|عائلة|شخصي|شخصية)/i.test(haystack),
    unread: !email.isRead,
  };
}

function matchesSmartSection(email: Email, section: SmartSection): boolean {
  if (section === "all") return true;
  const signals = getSmartSignals(email);
  const signalKey = section === "followUp" ? "followUp" : section === "meetings" ? "meeting" : section === "deadlines" ? "deadline" : section;
  return signals[signalKey];
}

function smartPriority(signals: SmartSignals): "high" | "normal" | "low" {
  if (signals.important) return "high";
  if (signals.followUp || signals.meeting || signals.unread) return "normal";
  return "low";
}

function smartReasonKeys(signals: SmartSignals): string[] {
  const reasons: string[] = [];
  if (signals.important) reasons.push("reasonImportant");
  if (signals.followUp) reasons.push("reasonFollowUp");
  if (signals.work) reasons.push("reasonWork");
  if (signals.meeting) reasons.push("reasonMeeting");
  if (signals.deadline) reasons.push("reasonDeadline");
  if (signals.personal) reasons.push("reasonPersonal");
  if (signals.unread) reasons.push("reasonUnread");
  return reasons;
}

interface EmailListProps {
  emails: Email[];
  selectedEmailId: string | null;
  onSelectEmail: (id: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  dateFrom: string;
  setDateFrom: (value: string) => void;
  dateTo: string;
  setDateTo: (value: string) => void;
  hasAttachments: boolean | undefined;
  setHasAttachments: (value: boolean | undefined) => void;
  unreadOnly: boolean;
  setUnreadOnly: (value: boolean) => void;
  sizeMin: string;
  setSizeMin: (value: string) => void;
  sizeMax: string;
  setSizeMax: (value: string) => void;
  labelFilter: string;
  setLabelFilter: (value: string) => void;
  category?: EmailCategory;
  setCategory: (value: EmailCategory | undefined) => void;
  categoryCounts?: Partial<Record<EmailCategory, number>>;
  isLoading?: boolean;
  currentFolder?: string;
}

export function EmailList({
  emails,
  selectedEmailId,
  onSelectEmail,
  searchQuery,
  setSearchQuery,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  hasAttachments,
  setHasAttachments,
  unreadOnly,
  setUnreadOnly,
  sizeMin,
  setSizeMin,
  sizeMax,
  setSizeMax,
  labelFilter,
  setLabelFilter,
  category,
  setCategory,
  categoryCounts,
  isLoading,
  currentFolder,
}: EmailListProps) {
  const { t, locale } = useI18n();
  const toggleStarMutation = useToggleEmailStar();
  const markReadMutation = useMarkEmailRead();
  const moveEmailMutation = useMoveEmail();
  const queryClient = useQueryClient();
  const [smartSection, setSmartSection] = React.useState<SmartSection>("all");
  const [quickActionId, setQuickActionId] = React.useState<string | null>(null);
  const [quickActionNotice, setQuickActionNotice] = React.useState<string | null>(null);
  const [categoryActionId, setCategoryActionId] = React.useState<string | null>(null);
  const [categoryNotice, setCategoryNotice] = React.useState<string | null>(null);
  const [isOffline, setIsOffline] = React.useState(() => typeof navigator !== "undefined" && !navigator.onLine);

  React.useEffect(() => {
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const categoryOptions: Array<{ id: EmailCategory; labelKey: string }> = [
    { id: "primary", labelKey: "categoryPrimary" },
    { id: "work", labelKey: "categoryWork" },
    { id: "social", labelKey: "categorySocial" },
    { id: "promotions", labelKey: "categoryPromotions" },
    { id: "newsletters", labelKey: "categoryNewsletters" },
    { id: "orders", labelKey: "categoryOrders" },
    { id: "travel", labelKey: "categoryTravel" },
    { id: "finance", labelKey: "categoryFinance" },
    { id: "bills", labelKey: "categoryBills" },
    { id: "events", labelKey: "categoryEvents" },
    { id: "security", labelKey: "categorySecurity" },
    { id: "spam", labelKey: "categorySpam" },
  ];

  const sectionOptions: Array<{ id: SmartSection; labelKey: string }> = [
    { id: "all", labelKey: "smartAll" },
    { id: "important", labelKey: "smartImportant" },
    { id: "followUp", labelKey: "smartFollowUp" },
    { id: "work", labelKey: "smartWork" },
    { id: "meetings", labelKey: "smartMeetings" },
    { id: "deadlines", labelKey: "smartDeadlines" },
    { id: "personal", labelKey: "smartPersonal" },
    { id: "unread", labelKey: "smartUnread" },
  ];

  const visibleEmails = React.useMemo(
    () => emails.filter((email) => matchesSmartSection(email, smartSection)),
    [emails, smartSection],
  );

  const handleCategoryChange = async (event: React.ChangeEvent<HTMLSelectElement>, email: Email) => {
    event.stopPropagation();
    const nextCategory = event.target.value as EmailCategory;
    setCategoryActionId(email.id);
    setCategoryNotice(null);
    try {
      await updateEmailCategory(email.id, nextCategory);
      setCategoryNotice(t("inbox.categorySaved"));
      await queryClient.invalidateQueries({ queryKey: getListEmailsQueryKey() });
    } catch {
      setCategoryNotice(t("inbox.categorySaveFailed"));
    } finally {
      setCategoryActionId(null);
    }
  };

  const handleQuickAction = async (
    event: React.MouseEvent,
    email: Email,
    action: "read" | "archive" | "task",
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const actionId = `${action}:${email.id}`;
    setQuickActionId(actionId);
    setQuickActionNotice(null);
    try {
      if (action === "read") {
        await markReadMutation.mutateAsync({ id: email.id, data: { isRead: !email.isRead } });
      } else if (action === "archive") {
        await moveEmailMutation.mutateAsync({ id: email.id, data: { folder: "archive", customFolderId: null } });
      } else {
        await createTask({ title: email.subject || t("email.noSubject"), notes: email.bodyText, emailId: email.id, priority: "normal" });
      }
      setQuickActionNotice(t("inbox.quickActionSaved"));
      await queryClient.invalidateQueries({ queryKey: getListEmailsQueryKey() });
    } catch {
      setQuickActionNotice(t("inbox.quickActionFailed"));
    } finally {
      setQuickActionId(null);
    }
  };

  const handleToggleStar = (event: React.MouseEvent, email: Email) => {
    event.preventDefault();
    event.stopPropagation();

    toggleStarMutation.mutate(
      { id: email.id },
      {
        onSuccess: async () => {
          if (currentFolder === "starred" && email.isStarred) {
            queryClient.setQueriesData(
              { queryKey: getListEmailsQueryKey() },
              (oldData: unknown) => {
                if (!oldData || typeof oldData !== "object") return oldData;
                const data = oldData as { emails?: Email[]; total?: number };
                if (!Array.isArray(data.emails)) return oldData;
                return {
                  ...data,
                  emails: data.emails.filter((item) => item.id !== email.id),
                  total: typeof data.total === "number" ? Math.max(0, data.total - 1) : data.total,
                };
              },
            );
          }

          await queryClient.invalidateQueries({
            queryKey: getListEmailsQueryKey(),
          });
        },
      },
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const dateLocale = getIntlLocale(locale);

    if (isToday(date)) {
      return new Intl.DateTimeFormat(dateLocale, {
        hour: "numeric",
        minute: "2-digit",
      }).format(date);
    }

    if (isYesterday(date)) {
      return t("inbox.yesterday");
    }

    return new Intl.DateTimeFormat(dateLocale, {
      month: "short",
      day: "numeric",
    }).format(date);
  };

  /**
   * Translate a raw Gmail/system label to a user-facing string.
   * Falls back to the original label if no translation key is defined.
   */
  const translateLabel = (label: string): string => {
    const key = `label.${label}`;
    const translated = t(key);
    // t() returns the key itself when not found — use original in that case
    return translated !== key ? translated : label;
  };

  const openEmailWithKeyboard = (event: React.KeyboardEvent<HTMLDivElement>, emailId: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectEmail(emailId);
    }
  };

  return (
    <div className="novamail-smart-inbox novamail-dense-inbox novamail-global-list flex h-full w-full flex-col border-r border-border bg-background">
      <div className="sticky top-0 z-10 border-b border-border bg-card/50 p-3 backdrop-blur supports-[backdrop-filter]:bg-card/50">
        <div className="relative">
          <Search className="absolute start-2.5 top-2.5 h-4 w-4 text-muted-foreground" />

          <Input
            type="search"
            placeholder={t("inbox.search")}
            className="border-border bg-background ps-9 shadow-none"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>
            <details className="mt-2 rounded-xl border border-border/60 bg-background">
              <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{t("inbox.advancedFilters")}</summary>
              <div className="grid grid-cols-2 gap-2 border-t border-border/60 p-3">
                <Input type="date" aria-label={t("filters.fromDate")} placeholder={t("filters.fromDate")} value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="h-8 text-xs" />
                <Input type="date" aria-label={t("filters.toDate")} placeholder={t("filters.toDate")} value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="h-8 text-xs" />
                <Input placeholder={t("filters.label")} aria-label={t("filters.label")} value={labelFilter} onChange={(event) => setLabelFilter(event.target.value)} className="h-8 text-xs" />
                <Input type="number" min="0" placeholder={t("filters.minBytes")} aria-label={t("filters.minBytes")} value={sizeMin} onChange={(event) => setSizeMin(event.target.value)} className="h-8 text-xs" />
                <Input type="number" min="0" placeholder={t("filters.maxBytes")} aria-label={t("filters.maxBytes")} value={sizeMax} onChange={(event) => setSizeMax(event.target.value)} className="h-8 text-xs" />
                <label className="flex h-8 items-center gap-2 rounded-md border px-2 text-xs text-muted-foreground"><input type="checkbox" aria-label={t("filters.unreadOnly")} checked={unreadOnly} onChange={(event) => setUnreadOnly(event.target.checked)} />{t("filters.unreadOnly")}</label>
                <label className="flex h-8 items-center gap-2 rounded-md border px-2 text-xs text-muted-foreground"><input type="checkbox" aria-label={t("filters.attachments")} checked={hasAttachments === true} onChange={(event) => setHasAttachments(event.target.checked ? true : undefined)} />{t("filters.attachments")}</label>
              </div>
            </details>
            {isOffline ? <div role="status" className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">{t("inbox.offlineNotice")}</div> : null}
        <div className="mt-3 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t("inbox.smartSections")}</p>
          <div role="tablist" aria-label={t("inbox.smartSections")} className="flex gap-1 overflow-x-auto pb-1">
            {sectionOptions.map((section) => {
              const count = section.id === "all" ? emails.length : emails.filter((email) => matchesSmartSection(email, section.id)).length;
              return (
                <button
                  key={section.id}
                  type="button"
                  role="tab"
                  aria-selected={smartSection === section.id}
                  onClick={() => setSmartSection(section.id)}
                  className={cn("shrink-0 rounded-full border px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", smartSection === section.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted")}
                >
                  {t(`inbox.${section.labelKey}`)} <span className="ms-1 opacity-75">{count}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] leading-4 text-muted-foreground">{t("inbox.smartSignalsNote")}</p>
          <div className="mt-2" role="group" aria-label={t("inbox.categoryFilters")}>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t("inbox.categoryFilters")}</p>
            <div className="flex gap-1 overflow-x-auto pb-1">
              <button type="button" className={cn("shrink-0 rounded-full border px-2.5 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", !category ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted")} onClick={() => setCategory(undefined)} aria-pressed={!category}>
                {t("inbox.categoryAll")} <span className="ms-1 opacity-75">{emails.length}</span>
              </button>
              {categoryOptions.map((option) => {
                const count = categoryCounts?.[option.id] ?? emails.filter((email) => email.category === option.id).length;
                return <button key={option.id} type="button" className={cn("shrink-0 rounded-full border px-2.5 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", category === option.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted")} onClick={() => setCategory(option.id)} aria-pressed={category === option.id}>{t(`inbox.${option.labelKey}`)} <span className="ms-1 opacity-75">{count}</span></button>;
              })}
            </div>
          </div>
          {quickActionNotice ? <p className="text-xs font-medium text-primary" aria-live="polite">{quickActionNotice}</p> : null}
          {categoryNotice ? <p className="text-xs font-medium text-primary" aria-live="polite">{categoryNotice}</p> : null}
        </div>
      </div>

      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="space-y-4 p-4">
            {[1, 2, 3, 4, 5].map((item) => (
              <div
                key={item}
                className="flex flex-col gap-2 rounded-lg border border-transparent p-3"
              >
                <div className="flex items-center justify-between">
                  <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-12 animate-pulse rounded bg-muted" />
                </div>

                <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-muted/50" />
              </div>
            ))}
          </div>
        ) : visibleEmails.length === 0 ? (
          <div className="flex flex-col items-center p-8 text-center text-muted-foreground">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted/50">
              <Search className="h-6 w-6 text-muted-foreground/50" />
            </div>

            <p>{t("inbox.noEmails")}</p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-border pb-28 md:pb-4">
            {visibleEmails.map((email) => {
              const signals = getSmartSignals(email);
              const priority = smartPriority(signals);
              const reasonKeys = smartReasonKeys(signals);
              return (
              <div
                key={email.id}
                role="button"
                tabIndex={0}
                aria-label={`${t("email.open")}: ${email.subject || t("email.noSubject")}`}
                onClick={() => onSelectEmail(email.id)}
                onKeyDown={(event) => openEmailWithKeyboard(event, email.id)}
                data-unread={!email.isRead ? "true" : "false"}
                data-starred={email.isStarred ? "true" : "false"}
                className={cn(
                  "novamail-email-row relative flex cursor-pointer flex-col items-start gap-1 border-s-0 p-3 text-start outline-none transition-colors focus-visible:z-10 focus-visible:ring-1 focus-visible:ring-ring",
                  selectedEmailId === email.id
                    ? "border-s-primary bg-primary/5"
                    : "border-s-transparent hover:bg-muted/50",
                  !email.isRead && "bg-background",
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <div className="flex min-w-0 items-center gap-2">
                    {!email.isRead && (
                      <span className="h-2 w-2 flex-shrink-0 rounded-full bg-primary" />
                    )}

                    <span
                      className={cn(
                        "novamail-email-sender truncate text-sm",
                        !email.isRead
                          ? "font-bold text-foreground"
                          : "font-medium text-foreground/80",
                      )}
                    >
                      {email.from.name || email.from.email}
                    </span>
                  </div>

                  <div className="flex flex-shrink-0 items-center gap-2">
                    {email.attachments && email.attachments.length > 0 && (
                      <Paperclip className="h-3 w-3 text-muted-foreground" />
                    )}

                    <span
                      className={cn(
                        "novamail-email-date whitespace-nowrap text-xs",
                        !email.isRead ? "font-semibold text-primary" : "text-muted-foreground",
                      )}
                    >
                      {formatDate(email.createdAt)}
                    </span>
                  </div>
                </div>

                <div className="mt-0.5 flex w-full items-center justify-between gap-4">
                  <span
                    className={cn(
                      "novamail-email-subject truncate text-sm",
                      !email.isRead ? "font-semibold text-foreground" : "text-foreground/70",
                    )}
                  >
                    {email.subject || t("email.noSubject")}
                  </span>

                  <button
                    type="button"
                    aria-label={email.isStarred ? t("email.unstar") : t("email.star")}
                    title={email.isStarred ? t("email.unstar") : t("email.star")}
                    onClick={(event) => handleToggleStar(event, email)}
                    disabled={toggleStarMutation.isPending}
                    className="novamail-email-star flex-shrink-0 rounded-md p-1 hover:bg-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Star
                      className={cn(
                        "h-4 w-4",
                        email.isStarred
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    />
                  </button>
                </div>

                <span className="novamail-email-preview mt-1 line-clamp-2 w-full pe-6 text-xs leading-relaxed text-muted-foreground">
                  {email.bodyText.substring(0, 150)}
                  {email.bodyText.length > 150 ? "..." : ""}
                </span>

                {(email.category || getDisplayLabels(email.labels, email.isRead, email.folder).length > 0) && (
                  <div className="novamail-email-labels mt-2 flex flex-wrap gap-1.5">
                    {email.category && (
                      <Badge variant="outline" className="px-2 py-0.5 text-[10px] font-semibold capitalize">{t(`inbox.category${email.category.charAt(0).toUpperCase()}${email.category.slice(1)}`)}</Badge>
                    )}
                    {getDisplayLabels(email.labels, email.isRead, email.folder).map((label) => (
                      <Badge
                        key={label}
                        variant="secondary"
                        className={cn(
                          "novamail-email-label px-2 py-0.5 text-[10px] font-semibold",
                          `novamail-label-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
                        )}
                      >
                        {translateLabel(label)}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border/50 pt-2" onClick={(event) => event.stopPropagation()}>
                  <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className="sr-only">{t("inbox.correctCategory")}</span>
                    <select value={email.category} aria-label={t("inbox.correctCategory")} disabled={categoryActionId === email.id} onChange={(event) => void handleCategoryChange(event, email)} className="h-7 max-w-[150px] rounded-md border bg-background px-1.5 text-[10px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                      {categoryOptions.map((option) => <option key={option.id} value={option.id}>{t(`inbox.${option.labelKey}`)}</option>)}
                    </select>
                  </label>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", priority === "high" ? "bg-destructive/10 text-destructive" : priority === "normal" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")} title={t("inbox.priorityReason")}>
                    {priority === "high" ? t("inbox.priorityHigh") : priority === "normal" ? t("inbox.priorityNormal") : t("inbox.priorityLow")}
                  </span>
                  {reasonKeys.map((reasonKey) => <Badge key={reasonKey} variant="outline" className="px-2 py-0.5 text-[10px]">{t(`inbox.${reasonKey}`)}</Badge>)}
                  <span className="ms-auto flex items-center gap-1" aria-label={t("inbox.quickActions")}>
                    <button type="button" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50" aria-label={email.isRead ? t("inbox.markUnreadQuick") : t("inbox.markReadQuick")} title={email.isRead ? t("inbox.markUnreadQuick") : t("inbox.markReadQuick")} disabled={quickActionId === `read:${email.id}`} onClick={(event) => void handleQuickAction(event, email, "read")}>
                      {quickActionId === `read:${email.id}` ? <span className="block h-3.5 w-3.5 animate-pulse rounded-full bg-muted-foreground" /> : <Check className="h-3.5 w-3.5" />}
                    </button>
                    <button type="button" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50" aria-label={t("inbox.archiveQuick")} title={t("inbox.archiveQuick")} disabled={quickActionId === `archive:${email.id}`} onClick={(event) => void handleQuickAction(event, email, "archive")}>
                      {quickActionId === `archive:${email.id}` ? <span className="block h-3.5 w-3.5 animate-pulse rounded-full bg-muted-foreground" /> : <Archive className="h-3.5 w-3.5" />}
                    </button>
                    <button type="button" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50" aria-label={t("inbox.createTaskQuick")} title={t("inbox.createTaskQuick")} disabled={quickActionId === `task:${email.id}`} onClick={(event) => void handleQuickAction(event, email, "task")}>
                      {quickActionId === `task:${email.id}` ? <span className="block h-3.5 w-3.5 animate-pulse rounded-full bg-muted-foreground" /> : <ListTodo className="h-3.5 w-3.5" />}
                    </button>
                  </span>
                </div>
              </div>
            ); })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
