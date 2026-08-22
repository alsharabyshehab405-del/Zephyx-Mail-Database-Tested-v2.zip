import React from "react";
import { isToday, isYesterday } from "date-fns";
import { Star, Paperclip, Search } from "lucide-react";
import type { Email } from "@workspace/api-client-react";
import { getListEmailsQueryKey, useToggleEmailStar } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useI18n } from "@/hooks/use-i18n";
import { getIntlLocale } from "@/lib/i18n-config";
import { cn } from "@/lib/utils";

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
  isLoading,
  currentFolder,
}: EmailListProps) {
  const { t, locale } = useI18n();
  const toggleStarMutation = useToggleEmailStar();
  const queryClient = useQueryClient();

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
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Input type="date" aria-label={t("filters.fromDate")} placeholder={t("filters.fromDate")} value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="h-8 text-xs" />
          <Input type="date" aria-label={t("filters.toDate")} placeholder={t("filters.toDate")} value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="h-8 text-xs" />
          <Input placeholder={t("filters.label")} aria-label={t("filters.label")} value={labelFilter} onChange={(event) => setLabelFilter(event.target.value)} className="h-8 text-xs" />
          <Input type="number" min="0" placeholder={t("filters.minBytes")} aria-label={t("filters.minBytes")} value={sizeMin} onChange={(event) => setSizeMin(event.target.value)} className="h-8 text-xs" />
          <Input type="number" min="0" placeholder={t("filters.maxBytes")} aria-label={t("filters.maxBytes")} value={sizeMax} onChange={(event) => setSizeMax(event.target.value)} className="h-8 text-xs" />
          <label className="flex h-8 items-center gap-2 rounded-md border px-2 text-xs text-muted-foreground">
            <input type="checkbox" aria-label={t("filters.unreadOnly")} checked={unreadOnly} onChange={(event) => setUnreadOnly(event.target.checked)} />
            {t("filters.unreadOnly")}
          </label>
          <label className="flex h-8 items-center gap-2 rounded-md border px-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              aria-label={t("filters.attachments")}
              checked={hasAttachments === true}
              onChange={(event) => setHasAttachments(event.target.checked ? true : undefined)}
            />
            {t("filters.attachments")}
          </label>
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
        ) : emails.length === 0 ? (
          <div className="flex flex-col items-center p-8 text-center text-muted-foreground">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted/50">
              <Search className="h-6 w-6 text-muted-foreground/50" />
            </div>

            <p>{t("inbox.noEmails")}</p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-border pb-28 md:pb-4">
            {emails.map((email) => (
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
                    {email.category && email.category !== "primary" && (
                      <Badge variant="outline" className="px-2 py-0.5 text-[10px] font-semibold capitalize">{email.category}</Badge>
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
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
