import { useEffect, useState } from "react";
import {
  Reply,
  ReplyAll,
  Forward,
  Trash2,
  Archive,
  MoreVertical,
  Star,
  Printer,
  Download,
  Eye,
  Loader2,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Clock3,
  ListTodo,
  CalendarDays,
} from "lucide-react";
import type { Email } from "@workspace/api-client-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/hooks/use-i18n";
import { getIntlLocale } from "@/lib/i18n-config";
import {
  useTrashEmail,
  useToggleEmailStar,
  useMarkEmailRead,
  useMoveEmail,
  useDeleteEmailPermanent,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListEmailsQueryKey,
  getGetEmailQueryKey,
  getGetInboxStatsQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { categorizeEmail, createCalendarEvent, createTask, snoozeEmail, summarizeEmail, suggestCalendar } from "@/lib/feature-api";

interface EmailDetailProps {
  email: Email | null;
  onReply: (email: Email) => void;
  onReplyAll: (email: Email) => void;
  onForward: (email: Email) => void;
  onClose?: () => void;
  currentFolder?: string;
}

export function EmailDetail({ email, onReply, onReplyAll, onForward, onClose, currentFolder }: EmailDetailProps) {
  const { t, locale } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const trashMutation = useTrashEmail();
  const restoreMutation = useMoveEmail();
  const archiveMutation = useMoveEmail();
  const spamMutation = useMoveEmail();
  const permanentDeleteMutation = useDeleteEmailPermanent();
  const toggleStarMutation = useToggleEmailStar();
  const markReadMutation = useMarkEmailRead();
  const [attachmentAction, setAttachmentAction] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [snoozeUntil, setSnoozeUntil] = useState("");
  const [meetingSuggestion, setMeetingSuggestion] = useState<{ title: string; start: string | null; end: string | null; attendees: string[] } | null>(null);
  const [productivityPanel, setProductivityPanel] = useState<"task" | "event" | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueAt, setTaskDueAt] = useState("");
  const [taskPriority, setTaskPriority] = useState<"low" | "normal" | "high">("normal");
  const [eventTitle, setEventTitle] = useState("");
  const [eventStartsAt, setEventStartsAt] = useState("");
  const [eventEndsAt, setEventEndsAt] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [eventAttendees, setEventAttendees] = useState<string[]>([]);
  const [productivityBusy, setProductivityBusy] = useState(false);
  const isRtl =
    typeof document !== "undefined" && document.documentElement.dir.toLowerCase() === "rtl";

  const formatMessageDate = (dateString: string) => {
    const date = new Date(dateString);
    const intlLocale = getIntlLocale(locale);
    const datePart = new Intl.DateTimeFormat(intlLocale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(date);
    const timePart = new Intl.DateTimeFormat(intlLocale, {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);

    return { datePart, timePart };
  };

  const fetchAttachmentBlob = async (url: string, mimeType: string): Promise<Blob> => {
    const requestAttachment = (accessToken: string | null) =>
      fetch(url, {
        headers: accessToken
          ? {
              Authorization: `Bearer ${accessToken}`,
            }
          : undefined,
      });

    let accessToken = sessionStorage.getItem("novamail-access");
    let response = await requestAttachment(accessToken);

    if (response.status === 401) {
      const refreshToken = sessionStorage.getItem("novamail-refresh");

      if (refreshToken) {
        const refreshResponse = await fetch("/api/auth/refresh", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ refreshToken }),
        });

        if (refreshResponse.ok) {
          const authData = (await refreshResponse.json()) as {
            accessToken: string;
            refreshToken: string;
            user?: unknown;
          };

          sessionStorage.setItem("novamail-access", authData.accessToken);
          sessionStorage.setItem("novamail-refresh", authData.refreshToken);

          if (authData.user) {
            sessionStorage.setItem("novamail-user", JSON.stringify(authData.user));
          }

          accessToken = authData.accessToken;
          response = await requestAttachment(accessToken);
        }
      }
    }

    if (!response.ok) {
      let message = `Failed to load attachment (HTTP ${response.status})`;

      try {
        const data = (await response.json()) as {
          error?: string;
          message?: string;
        };

        message = data.error || data.message || message;
      } catch {
        // The response was not JSON.
      }

      throw new Error(message);
    }

    const blob = await response.blob();

    if (blob.type || !mimeType) {
      return blob;
    }

    return new Blob([blob], { type: mimeType });
  };

  const handleOpenAttachment = async (attachment: {
    filename: string;
    url: string;
    mimeType: string;
  }) => {
    const actionKey = `open:${attachment.url}`;
    const previewWindow = window.open("", "_blank");

    if (!previewWindow) {
      toast({
        title: t("email.attachmentOpenBlocked"),
        description: t("email.attachmentOpenBlockedDescription"),
        variant: "destructive",
      });
      return;
    }

    previewWindow.document.title = attachment.filename;
    previewWindow.document.body.innerHTML =
      `<p style="font-family:sans-serif;padding:24px">${t("email.loadingAttachment")}</p>`;

    setAttachmentAction(actionKey);

    try {
      const blob = await fetchAttachmentBlob(attachment.url, attachment.mimeType);
      const objectUrl = URL.createObjectURL(blob);

      previewWindow.location.href = objectUrl;

      window.setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
      }, 60_000);
    } catch (error: unknown) {
      previewWindow.close();

      toast({
        title: t("email.attachmentOpenFailed"),
        description: error instanceof Error ? error.message : t("email.attachmentOpenFailedDescription"),
        variant: "destructive",
      });
    } finally {
      setAttachmentAction(null);
    }
  };

  const handleDownloadAttachment = async (attachment: {
    filename: string;
    url: string;
    mimeType: string;
  }) => {
    const actionKey = `download:${attachment.url}`;
    setAttachmentAction(actionKey);

    try {
      const blob = await fetchAttachmentBlob(attachment.url, attachment.mimeType);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = objectUrl;
      link.download = attachment.filename;
      link.style.display = "none";

      document.body.appendChild(link);
      link.click();
      link.remove();

      window.setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
      }, 1_000);

      toast({
        title: t("email.attachmentDownloaded"),
        description: attachment.filename,
      });
    } catch (error: unknown) {
      toast({
        title: t("email.attachmentDownloadFailed"),
        description: error instanceof Error ? error.message : t("email.attachmentDownloadFailedDescription"),
        variant: "destructive",
      });
    } finally {
      setAttachmentAction(null);
    }
  };

  // جعل الرسالة مقروءة عند فتحها
  useEffect(() => {
    setAiSummary(email?.aiSummary || null);
    setMeetingSuggestion(null);
    setSnoozeUntil("");
  }, [email?.id, email?.aiSummary]);

  useEffect(() => {
    if (email && !email.isRead) {
      markReadMutation.mutate(
        {
          id: email.id,
          data: {
            isRead: true,
          },
        },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({
              queryKey: getListEmailsQueryKey(),
            });

            queryClient.invalidateQueries({
              queryKey: getGetInboxStatsQueryKey(),
            });

            queryClient.setQueryData(getGetEmailQueryKey(email.id), (old: unknown) =>
              old && typeof old === "object"
                ? {
                    ...(old as Record<string, unknown>),
                    isRead: true,
                  }
                : old,
            );
          },
        },
      );
    }
  }, [email?.id]);

  if (!email) {
    return (
      <div className="h-full flex items-center justify-center bg-muted/10">
        <div className="text-center text-muted-foreground flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
            <div className="w-8 h-8 rounded bg-muted/80" />
          </div>

          <p>{t("email.selectPrompt")}</p>
        </div>
      </div>
    );
  }

  const initials = `${email.from.name?.[0] || ""}${email.from.email[0]}`
    .toUpperCase()
    .substring(0, 2);

  // نقل الرسالة إلى Trash
  const handleTrash = () => {
    trashMutation.mutate(
      {
        id: email.id,
      },
      {
        onSuccess: async () => {
          toast({
            title: t("email.movedToTrash"),
          });

          await queryClient.invalidateQueries({
            queryKey: getListEmailsQueryKey(),
          });

          await queryClient.invalidateQueries({
            queryKey: getGetInboxStatsQueryKey(),
          });

          if (onClose) {
            onClose();
          }
        },

        onError: (error: unknown) => {
          const message = error instanceof Error ? error.message : t("email.deleteFailed");

          toast({
            title: t("email.deleteFailed"),
            description: message,
            variant: "destructive",
          });
        },
      },
    );
  };

  // استعادة الرسالة من Trash إلى Inbox
  const handleRestore = () => {
    restoreMutation.mutate(
      {
        id: email.id,
        data: {
          folder: "inbox",
          customFolderId: null,
        },
      },
      {
        onSuccess: async () => {
          toast({
            title: t("email.restoredToInbox"),
          });

          await queryClient.invalidateQueries({
            queryKey: getListEmailsQueryKey(),
          });

          await queryClient.invalidateQueries({
            queryKey: getGetInboxStatsQueryKey(),
          });

          if (onClose) {
            onClose();
          }
        },

        onError: (error: unknown) => {
          const message = error instanceof Error ? error.message : t("email.restoreFailed");

          toast({
            title: t("email.restoreFailed"),
            description: message,
            variant: "destructive",
          });
        },
      },
    );
  };
  const handleArchive = () => {
    const targetFolder = email.folder === "archive" ? "inbox" : "archive";

    archiveMutation.mutate(
      {
        id: email.id,
        data: {
          folder: targetFolder,
          customFolderId: null,
        },
      },
      {
        onSuccess: async () => {
          toast({
            title: targetFolder === "archive" ? t("email.movedToArchive") : t("email.restoredToInbox"),
          });

          await queryClient.invalidateQueries({
            queryKey: getListEmailsQueryKey(),
          });

          await queryClient.invalidateQueries({
            queryKey: getGetInboxStatsQueryKey(),
          });

          if (onClose) {
            onClose();
          }
        },

        onError: (error: unknown) => {
          const message = error instanceof Error ? error.message : t("email.archiveFailed");

          toast({
            title: t("email.archiveFailed"),
            description: message,
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleSpam = () => {
    const targetFolder = email.folder === "spam" ? "inbox" : "spam";

    spamMutation.mutate(
      {
        id: email.id,
        data: {
          folder: targetFolder,
          customFolderId: null,
        },
      },
      {
        onSuccess: async () => {
          toast({
            title: targetFolder === "spam" ? t("folder.spam") : t("email.restoredToInbox"),
          });

          await Promise.all([
            queryClient.invalidateQueries({ queryKey: getListEmailsQueryKey() }),
            queryClient.invalidateQueries({ queryKey: getGetInboxStatsQueryKey() }),
          ]);

          queryClient.removeQueries({ queryKey: getGetEmailQueryKey(email.id) });
          onClose?.();
        },
        onError: (error: unknown) => {
          const message = error instanceof Error ? error.message : t("email.updateFailed");
          toast({
            title: t("common.error"),
            description: message,
            variant: "destructive",
          });
        },
      },
    );
  };

  // حذف الرسالة نهائيًا
  const handlePermanentDelete = () => {
    const confirmed = window.confirm(t("email.deleteConfirm"));

    if (!confirmed) {
      return;
    }

    permanentDeleteMutation.mutate(
      {
        id: email.id,
      },
      {
        onSuccess: async () => {
          toast({
            title: t("email.deletedPermanently"),
          });

          await queryClient.invalidateQueries({
            queryKey: getListEmailsQueryKey(),
          });

          await queryClient.invalidateQueries({
            queryKey: getGetInboxStatsQueryKey(),
          });

          queryClient.removeQueries({
            queryKey: getGetEmailQueryKey(email.id),
          });

          if (onClose) {
            onClose();
          }
        },

        onError: (error: unknown) => {
          const message =
            error instanceof Error ? error.message : t("email.permanentDeleteFailed");

          toast({
            title: t("email.permanentDeleteFailed"),
            description: message,
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleToggleStar = () => {
    toggleStarMutation.mutate(
      {
        id: email.id,
      },
      {
        onSuccess: async () => {
          const removingFromStarred = currentFolder === "starred" && email.isStarred;

          if (removingFromStarred) {
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

          queryClient.setQueryData(getGetEmailQueryKey(email.id), (oldData: unknown) =>
            oldData && typeof oldData === "object"
              ? {
                  ...(oldData as Record<string, unknown>),
                  isStarred: !email.isStarred,
                }
              : oldData,
          );

          await queryClient.invalidateQueries({
            queryKey: getListEmailsQueryKey(),
          });

          await queryClient.invalidateQueries({
            queryKey: getGetInboxStatsQueryKey(),
          });

          if (removingFromStarred) onClose?.();
        },

        onError: (error: unknown) => {
          const message = error instanceof Error ? error.message : t("email.starUpdateFailed");

          toast({
            title: t("email.starUpdateFailed"),
            description: message,
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleMarkUnread = () => {
    markReadMutation.mutate(
      {
        id: email.id,
        data: {
          isRead: false,
        },
      },
      {
        onSuccess: async () => {
          toast({
            title: t("email.markedUnread"),
          });

          await queryClient.invalidateQueries({
            queryKey: getListEmailsQueryKey(),
          });

          await queryClient.invalidateQueries({
            queryKey: getGetInboxStatsQueryKey(),
          });

          if (onClose) {
            onClose();
          }
        },

        onError: (error: unknown) => {
          const message = error instanceof Error ? error.message : t("email.updateFailed");

          toast({
            title: t("email.updateFailed"),
            description: message,
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleSummarize = async () => {
    setAiBusy(true);
    try {
      const result = await summarizeEmail(email.id);
      setAiSummary(result.summary);
      toast({ title: "Thread summary ready" });
    } catch (error) {
      toast({ title: "Could not summarize thread", description: error instanceof Error ? error.message : "Try again later", variant: "destructive" });
    } finally {
      setAiBusy(false);
    }
  };

  const handleCategorize = async () => {
    setAiBusy(true);
    try {
      const result = await categorizeEmail(email.id);
      toast({ title: `Category: ${result.category}` });
      await queryClient.invalidateQueries({ queryKey: getListEmailsQueryKey() });
    } catch (error) {
      toast({ title: "Could not categorize email", description: error instanceof Error ? error.message : "Try again later", variant: "destructive" });
    } finally {
      setAiBusy(false);
    }
  };

  const handleSnooze = async () => {
    if (!snoozeUntil) return;
    try {
      await snoozeEmail(email.id, new Date(snoozeUntil).toISOString());
      toast({ title: "Email snoozed" });
      await queryClient.invalidateQueries({ queryKey: getListEmailsQueryKey() });
      onClose?.();
    } catch (error) {
      toast({ title: "Could not snooze email", description: error instanceof Error ? error.message : "Choose a future time", variant: "destructive" });
    }
  };

  const openTaskForm = () => {
    setTaskTitle(email.subject || t("email.createTask"));
    setTaskDueAt("");
    setTaskPriority("normal");
    setProductivityPanel("task");
  };

  const saveTask = async () => {
    const title = taskTitle.trim();
    if (!title) return;
    setProductivityBusy(true);
    try {
      await createTask({ emailId: email.id, title, notes: email.bodyText.slice(0, 500), dueAt: taskDueAt ? new Date(taskDueAt).toISOString() : undefined, priority: taskPriority });
      toast({ title: t("email.taskCreated") });
      setProductivityPanel(null);
    } catch (error) {
      toast({ title: t("email.productivityActionFailed"), description: error instanceof Error ? error.message : t("email.productivityActionFailed"), variant: "destructive" });
    } finally {
      setProductivityBusy(false);
    }
  };

  const openEventForm = async () => {
    setProductivityBusy(true);
    try {
      const suggestion = await suggestCalendar(email.id);
      setMeetingSuggestion(suggestion);
      setEventTitle(suggestion?.title || email.subject || t("email.createEvent"));
      setEventStartsAt(suggestion?.start ? new Date(suggestion.start).toISOString().slice(0, 16) : "");
      setEventEndsAt(suggestion?.end ? new Date(suggestion.end).toISOString().slice(0, 16) : "");
      setEventAttendees(suggestion?.attendees ?? email.to.map((recipient) => recipient.email));
      setEventLocation("");
      setProductivityPanel("event");
      if (!suggestion?.detected) toast({ title: t("email.noMeetingDetected"), description: t("email.meetingSuggestionReview") });
    } catch (error) {
      toast({ title: t("email.productivityActionFailed"), description: error instanceof Error ? error.message : t("email.productivityActionFailed"), variant: "destructive" });
    } finally {
      setProductivityBusy(false);
    }
  };

  const saveEvent = async () => {
    if (!eventTitle.trim() || !eventStartsAt || !eventEndsAt) return;
    setProductivityBusy(true);
    try {
      await createCalendarEvent({ emailId: email.id, title: eventTitle.trim(), startsAt: new Date(eventStartsAt).toISOString(), endsAt: new Date(eventEndsAt).toISOString(), location: eventLocation.trim() || undefined, attendees: eventAttendees });
      toast({ title: t("email.eventCreated") });
      setProductivityPanel(null);
    } catch (error) {
      toast({ title: t("email.productivityActionFailed"), description: error instanceof Error ? error.message : t("email.productivityActionFailed"), variant: "destructive" });
    } finally {
      setProductivityBusy(false);
    }
  };

  const isTrash = email.folder === "trash";
  const formattedMessageDate = formatMessageDate(email.createdAt);

  return (
    <div
      dir={isRtl ? "rtl" : "ltr"}
      className="novamail-global-reader flex min-w-0 flex-col h-full bg-background relative overflow-hidden"
    >
      <div className="novamail-reader-toolbar email-detail-toolbar flex items-center justify-between gap-2 p-2 sm:p-3 border-b border-border bg-card/50 backdrop-blur sticky top-0 z-10 overflow-x-auto">
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onReply(email)}
            title={t("email.reply")}
          >
            <Reply className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onReplyAll(email)}
            title={t("email.replyAll")}
          >
            <ReplyAll className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onForward(email)}
            title={t("email.forward")}
          >
            <Forward className="h-4 w-4" />
          </Button>

          <Separator orientation="vertical" className="mx-1 h-6" />

          {isTrash ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  handleRestore();
                }}
                disabled={restoreMutation.isPending || permanentDeleteMutation.isPending}
                title={t("email.restoreToInbox")}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  handlePermanentDelete();
                }}
                disabled={permanentDeleteMutation.isPending || restoreMutation.isPending}
                title={t("email.deletePermanently")}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleTrash();
              }}
              disabled={trashMutation.isPending}
              title={t("email.delete")}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleArchive}
            disabled={archiveMutation.isPending}
            title={email.folder === "archive" ? t("email.restoreToInbox") : t("email.archive")}
          >
            {email.folder === "archive" ? (
              <RotateCcw className="h-4 w-4" />
            ) : (
              <Archive className="h-4 w-4" />
            )}
          </Button>

          <Button type="button" variant="ghost" size="sm" onClick={() => void handleSummarize()} disabled={aiBusy} title="Summarize thread">
            <Sparkles className="me-1 h-4 w-4" /> Summary
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => void handleCategorize()} disabled={aiBusy} title="Categorize email">Category</Button>
          <div className="flex items-center gap-1">
            <input type="datetime-local" value={snoozeUntil} onChange={(event) => setSnoozeUntil(event.target.value)} min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)} className="h-8 w-36 rounded-md border bg-background px-1 text-xs" aria-label="Snooze until" />
            <Button type="button" variant="ghost" size="sm" onClick={() => void handleSnooze()} disabled={!snoozeUntil} title="Snooze email"><Clock3 className="me-1 h-4 w-4" />Snooze</Button>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={openTaskForm} disabled={productivityBusy} title={t("email.createTask")}><ListTodo className="me-1 h-4 w-4" />{t("email.createTask")}</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => void openEventForm()} disabled={productivityBusy} title={t("email.createEvent")}><CalendarDays className="me-1 h-4 w-4" />{productivityBusy ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : null}{t("email.createEvent")}</Button>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleToggleStar}
            disabled={toggleStarMutation.isPending}
            aria-label={email.isStarred ? t("email.unstar") : t("email.star")}
            title={email.isStarred ? t("email.unstar") : t("email.star")}
          >
            <Star
              className={`h-4 w-4 ${email.isStarred ? "fill-yellow-400 text-yellow-400" : ""}`}
            />
          </Button>

            <Button
              variant="ghost"
              size="sm"
              data-testid="spam-action-button"
              onClick={handleSpam}
              disabled={spamMutation.isPending}
              title={email.folder === "spam" ? t("email.restoreToInbox") : t("folder.spam")}
              aria-label={email.folder === "spam" ? t("email.restoreToInbox") : t("folder.spam")}
            >
              <ShieldAlert className="h-4 w-4" />
            </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" aria-label={t("inbox.more")} title={t("inbox.more")}>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={markReadMutation.isPending} onClick={handleMarkUnread}>
                {t("email.markUnread")}
              </DropdownMenuItem>

              <DropdownMenuItem
                disabled={spamMutation.isPending}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  handleSpam();
                }}
              >
                {email.folder === "spam" ? (
                  <RotateCcw className="mr-2 h-4 w-4" />
                ) : (
                  <ShieldAlert className="mr-2 h-4 w-4" />
                )}
                {email.folder === "spam" ? t("email.restoreToInbox") : t("folder.spam")}
              </DropdownMenuItem>

              <DropdownMenuItem>
                <Printer className="mr-2 h-4 w-4" />
                {t("email.print")}
              </DropdownMenuItem>

              {isTrash ? (
                <>
                  <DropdownMenuItem
                    disabled={restoreMutation.isPending || permanentDeleteMutation.isPending}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      handleRestore();
                    }}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    {t("email.restoreToInbox")}
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    disabled={permanentDeleteMutation.isPending || restoreMutation.isPending}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      handlePermanentDelete();
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t("email.deletePermanently")}
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  disabled={trashMutation.isPending}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    handleTrash();
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t("email.delete")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ScrollArea className="min-w-0 flex-1">
        <div className="novamail-reader-content w-full max-w-4xl mx-auto p-4 sm:p-6 md:p-8 overflow-hidden">
          <div className="novamail-reader-stack flex flex-col gap-6">
            <h1
              dir="auto"
              className="novamail-reader-subject mixed-direction-text break-words text-2xl font-bold text-foreground leading-tight"
            >
              {email.subject || t("email.noSubject")}
            </h1>

            {aiSummary && (
              <section className="rounded-lg border border-primary/20 bg-primary/5 p-4" aria-label="AI thread summary">
                <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-primary"><Sparkles className="h-4 w-4" /> AI summary</div>
                <p className="text-sm leading-6 text-foreground/80">{aiSummary}</p>
              </section>
            )}
            {meetingSuggestion?.start && (
              <section className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm" dir="auto">{t("email.meetingSuggestionReview")}: {meetingSuggestion.title} · {new Date(meetingSuggestion.start).toLocaleString(locale)}</section>
            )}

            {productivityPanel ? (
              <section className="rounded-2xl border border-primary/20 bg-primary/[0.03] p-4" aria-label={t("email.productivityActions")}>
                {productivityPanel === "task" ? (
                  <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); void saveTask(); }}>
                    <h2 className="text-base font-semibold">{t("email.createTask")}</h2>
                    <label className="grid gap-1 text-sm font-medium" htmlFor="email-task-title"><span>{t("email.taskTitle")}</span><Input id="email-task-title" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} required autoFocus dir="auto" /></label>
                    <label className="grid gap-1 text-sm font-medium" htmlFor="email-task-due"><span>{t("email.taskDueAt")}</span><Input id="email-task-due" type="datetime-local" value={taskDueAt} onChange={(event) => setTaskDueAt(event.target.value)} /></label>
                    <label className="grid gap-1 text-sm font-medium" htmlFor="email-task-priority"><span>{t("email.taskPriority")}</span><select id="email-task-priority" value={taskPriority} onChange={(event) => setTaskPriority(event.target.value as "low" | "normal" | "high")} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="low">{t("email.priorityLow")}</option><option value="normal">{t("email.priorityNormal")}</option><option value="high">{t("email.priorityHigh")}</option></select></label>
                    <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setProductivityPanel(null)}>{t("email.cancelAction")}</Button><Button type="submit" disabled={productivityBusy || !taskTitle.trim()}>{productivityBusy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <ListTodo className="me-2 h-4 w-4" />}{t("email.saveTask")}</Button></div>
                  </form>
                ) : (
                  <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); void saveEvent(); }}>
                    <h2 className="text-base font-semibold">{t("email.createEvent")}</h2>
                    <p className="text-xs text-muted-foreground">{t("email.meetingSuggestionReview")}</p>
                    <label className="grid gap-1 text-sm font-medium" htmlFor="email-event-title"><span>{t("email.eventTitle")}</span><Input id="email-event-title" value={eventTitle} onChange={(event) => setEventTitle(event.target.value)} required autoFocus dir="auto" /></label>
                    <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-medium" htmlFor="email-event-start"><span>{t("email.eventStartsAt")}</span><Input id="email-event-start" type="datetime-local" value={eventStartsAt} onChange={(event) => setEventStartsAt(event.target.value)} required /></label><label className="grid gap-1 text-sm font-medium" htmlFor="email-event-end"><span>{t("email.eventEndsAt")}</span><Input id="email-event-end" type="datetime-local" value={eventEndsAt} onChange={(event) => setEventEndsAt(event.target.value)} required /></label></div>
                    <label className="grid gap-1 text-sm font-medium" htmlFor="email-event-location"><span>{t("email.eventLocation")}</span><Input id="email-event-location" value={eventLocation} onChange={(event) => setEventLocation(event.target.value)} dir="auto" /></label>
                    {eventAttendees.length ? <p className="text-xs text-muted-foreground" dir="auto">{t("email.to")}: {eventAttendees.join(", ")}</p> : null}
                    <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setProductivityPanel(null)}>{t("email.cancelAction")}</Button><Button type="submit" disabled={productivityBusy || !eventTitle.trim() || !eventStartsAt || !eventEndsAt}>{productivityBusy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <CalendarDays className="me-2 h-4 w-4" />}{t("email.saveEvent")}</Button></div>
                  </form>
                )}
              </section>
            ) : null}

            <div className="novamail-reader-meta flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 flex-1 gap-3 sm:gap-4">
                <Avatar className="h-10 w-10 border border-border mt-0.5">
                  <AvatarFallback className="bg-primary/10 text-primary">{initials}</AvatarFallback>
                </Avatar>

                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex min-w-0 items-center gap-2 flex-wrap">
                    <span
                      dir="auto"
                      className="mixed-direction-text min-w-0 break-words font-semibold text-foreground"
                    >
                      {email.from.name || email.from.email}
                    </span>

                    {email.from.email !== email.from.name && (
                      <bdi
                        dir="ltr"
                        className="email-address max-w-full break-all text-sm text-muted-foreground"
                      >
                        {`<${email.from.email}>`}
                      </bdi>
                    )}
                  </div>

                  <div className="mt-1 flex min-w-0 flex-wrap items-start gap-x-1 text-sm text-muted-foreground">
                    <span>{t("email.to")}</span>

                    <span className="min-w-0 break-words">
                      {email.to.map((recipient, index) => (
                        <span key={index}>
                          <bdi dir="auto" className="mixed-direction-text">
                            {recipient.name || recipient.email}
                          </bdi>
                          {index < email.to.length - 1 ? ", " : ""}
                        </span>
                      ))}
                    </span>
                  </div>
                </div>
              </div>

              <time
                dir="auto"
                dateTime={new Date(email.createdAt).toISOString()}
                className="novamail-reader-date email-date self-start whitespace-nowrap text-sm text-muted-foreground sm:self-auto"
              >
                <bdi dir="auto">{formattedMessageDate.datePart}</bdi>
                <span className="novamail-reader-date-separator" aria-hidden="true"> · </span>
                <bdi dir="auto">{formattedMessageDate.timePart}</bdi>
              </time>
            </div>

            <Separator />

            <section className="novamail-reader-body-card">
            {email.bodyHtml ? (
              <div
                dir="auto"
                className="email-rich-body mixed-direction-text prose dark:prose-invert max-w-none text-foreground prose-p:leading-relaxed prose-a:text-primary hover:prose-a:text-primary/80"
                dangerouslySetInnerHTML={{
                  __html: email.bodyHtml,
                }}
              />
            ) : (
              <div
                dir="auto"
                className="email-rich-body mixed-direction-text whitespace-pre-wrap break-words text-foreground"
              >
                {email.bodyText}
              </div>
            )}
            </section>

            {email.attachments && email.attachments.length > 0 && (
              <div className="novamail-reader-attachments mt-8 pt-6 border-t border-border">
                <h4 className="text-sm font-semibold mb-4 text-foreground/80">
                  {t("email.attachments")} ({email.attachments.length})
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {email.attachments.map((attachment, index) => {
                    const openActionKey = `open:${attachment.url}`;
                    const downloadActionKey = `download:${attachment.url}`;

                    return (
                      <div
                        key={`${attachment.url}-${index}`}
                        className="novamail-reader-attachment flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors group"
                      >
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-3 text-start"
                          onClick={() => handleOpenAttachment(attachment)}
                          title={`${t("email.openAttachment")} ${attachment.filename}`}
                        >
                          <span className="w-10 h-10 rounded bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                            <span className="text-xs font-bold uppercase">
                              {attachment.filename.split(".").pop() || "FILE"}
                            </span>
                          </span>

                          <span className="flex min-w-0 flex-col overflow-hidden">
                            <span
                              dir="auto"
                              title={attachment.filename}
                              className="novamail-reader-attachment-name mixed-direction-text text-sm font-medium line-clamp-2 group-hover:text-primary transition-colors"
                            >
                              {attachment.filename}
                            </span>

                            <span className="text-xs text-muted-foreground">
                              {(attachment.size / 1024).toFixed(1)} KB
                            </span>
                          </span>
                        </button>

                        <div className="ms-auto flex shrink-0 items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={attachmentAction !== null}
                            title={t("email.openAttachment")}
                            onClick={() => handleOpenAttachment(attachment)}
                          >
                            {attachmentAction === openActionKey ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>

                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={attachmentAction !== null}
                            title={t("email.downloadAttachment")}
                            onClick={() => handleDownloadAttachment(attachment)}
                          >
                            {attachmentAction === downloadActionKey ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Download className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="email-detail-actions mt-10 grid grid-cols-1 gap-2 min-[390px]:grid-cols-3 sm:flex sm:flex-wrap sm:gap-3">
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => onReply(email)}
              >
                <Reply className="h-4 w-4" />
                {t("email.reply")}
              </Button>

              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => onReplyAll(email)}
              >
                <ReplyAll className="h-4 w-4" />
                {t("email.replyAll")}
              </Button>

              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => onForward(email)}
              >
                <Forward className="h-4 w-4" />
                {t("email.forward")}
              </Button>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
