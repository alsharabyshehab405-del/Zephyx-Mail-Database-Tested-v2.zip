import { useEffect, useState, type MouseEvent } from "react";
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
  ThumbsUp,
  ThumbsDown,
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
import { categorizeEmail, createCalendarEvent, createFollowUp, createTask, getAiPhishingAnalysis, getEmailActions, getEmailSecurityFeedback, getEmailThreat, reportEmailSecurity, requestAiPhishingAnalysis, snoozeEmail, submitEmailSecurityFeedback, summarizeEmail, suggestCalendar, type AiPhishingResult, type EmailAction, type SecurityFeedback, type SecurityFeedbackType, type SmartSummaryResult, type SummaryMode, type ThreatAnalysis } from "@/lib/feature-api";

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
  const [smartSummary, setSmartSummary] = useState<SmartSummaryResult | null>(null);
  const [summaryMode, setSummaryMode] = useState<SummaryMode>("short");
  const [emailActions, setEmailActions] = useState<EmailAction[] | null>(null);
  const [actionsBusy, setActionsBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [snoozeUntil, setSnoozeUntil] = useState("");
  const [followUpReminder, setFollowUpReminder] = useState("");
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
  const [threatAnalysis, setThreatAnalysis] = useState<ThreatAnalysis | null>(null);
  const [threatLoading, setThreatLoading] = useState(false);
  const [aiPhishing, setAiPhishing] = useState<AiPhishingResult | null>(null);
  const [aiPhishingLoading, setAiPhishingLoading] = useState(false);
  const [aiPhishingBusy, setAiPhishingBusy] = useState(false);
  const [threatAction, setThreatAction] = useState<"spam" | "phishing" | null>(null);
  const [pendingDangerousLink, setPendingDangerousLink] = useState<string | null>(null);
  const [securityFeedback, setSecurityFeedback] = useState<SecurityFeedback | null>(null);
  const [securityFeedbackBusy, setSecurityFeedbackBusy] = useState(false);
  const isRtl =
    typeof document !== "undefined" && document.documentElement.dir.toLowerCase() === "rtl";

  const simpleSecurityState = threatAnalysis?.malwareStatus === "blocked"
    ? "blocked"
    : threatAnalysis?.overallRisk === "high"
      ? "dangerous"
      : threatAnalysis?.overallRisk === "medium" || threatAnalysis?.overallRisk === "low"
        ? "suspicious"
        : "safe";

  const simpleSecurityReason = threatAnalysis?.malwareStatus === "blocked"
    ? t("email.securityBlockedReason")
    : threatAnalysis?.urlFindings.some((finding) => finding.verdict === "malicious")
      ? t("email.securityDangerousLinkReason")
      : threatAnalysis?.spamReasons[0]?.label || (threatAnalysis?.spoofingRisk !== "none" ? t("email.senderSpoofingWarning") : t("email.securityNoKnownThreats"));

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
    scanStatus?: string;
  }) => {
    if (attachment.scanStatus !== "clean" || /\.(?:exe|msi|scr|js|vbs|ps1|bat|cmd|com|jar|zip|7z|rar)$/i.test(attachment.filename)) {
      toast({
        title: t("email.dangerousAttachmentBlocked"),
        description: t("email.dangerousAttachmentBlockedDescription"),
        variant: "destructive",
      });
      return;
    }
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
    scanStatus?: string;
  }) => {
    if (attachment.scanStatus !== "clean" || /\.(?:exe|msi|scr|js|vbs|ps1|bat|cmd|com|jar|zip|7z|rar)$/i.test(attachment.filename)) {
      toast({
        title: t("email.dangerousAttachmentBlocked"),
        description: t("email.dangerousAttachmentBlockedDescription"),
        variant: "destructive",
      });
      return;
    }
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
    setFollowUpReminder("");
    setThreatAnalysis(null);
    setAiPhishing(null);
    setAiPhishingLoading(false);
    setPendingDangerousLink(null);
    setSecurityFeedback(null);
    if (!email) return;
    let cancelled = false;
    setThreatLoading(true);
    getEmailThreat(email.id)
      .then(({ analysis }) => {
        if (!cancelled) setThreatAnalysis(analysis);
      })
      .catch(() => {
        if (!cancelled) setThreatAnalysis(null);
      })
      .finally(() => {
        if (!cancelled) setThreatLoading(false);
      });
    getEmailSecurityFeedback(email.id)
      .then(({ feedback }) => {
        if (!cancelled) setSecurityFeedback(feedback);
      })
      .catch(() => {
        if (!cancelled) setSecurityFeedback(null);
      });
    setAiPhishingLoading(true);
    getAiPhishingAnalysis(email.id)
      .then(({ analysis }) => {
        if (!cancelled) setAiPhishing(analysis);
      })
      .catch(() => {
        if (!cancelled) setAiPhishing(null);
      })
      .finally(() => {
        if (!cancelled) setAiPhishingLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [email?.id, email?.aiSummary]);

  const runAiPhishingAnalysis = async () => {
    if (!email) return;
    setAiPhishingBusy(true);
    try {
      const { analysis } = await requestAiPhishingAnalysis(email.id, undefined, locale);
      setAiPhishing(analysis);
      toast({ title: analysis.verdict === "not_configured" ? t("email.aiPhishingNotConfigured") : t("email.aiPhishingAnalysisReady") });
    } catch (error: unknown) {
      toast({ title: t("email.aiPhishingAnalysisFailed"), description: error instanceof Error ? error.message : t("email.aiPhishingAnalysisFailed"), variant: "destructive" });
    } finally {
      setAiPhishingBusy(false);
    }
  };

  const saveSecurityFeedback = async (feedbackType: SecurityFeedbackType) => {
    if (!email) return;
    setSecurityFeedbackBusy(true);
    try {
      const { feedback } = await submitEmailSecurityFeedback(email.id, feedbackType);
      setSecurityFeedback(feedback);
      toast({ title: t("email.securityFeedbackSaved") });
    } catch (error: unknown) {
      toast({ title: t("email.securityFeedbackFailed"), description: error instanceof Error ? error.message : t("email.securityFeedbackFailed"), variant: "destructive" });
    } finally {
      setSecurityFeedbackBusy(false);
    }
  };

  const reportThreat = async (type: "spam" | "phishing") => {
    if (!email) return;
    setThreatAction(type);
    try {
      await reportEmailSecurity(email.id, type);
      toast({ title: t(type === "spam" ? "email.spamReported" : "email.phishingReported") });
      await queryClient.invalidateQueries({ queryKey: getListEmailsQueryKey() });
      if (type === "spam") onClose?.();
    } catch (error: unknown) {
      toast({
        title: t("email.securityReportFailed"),
        description: error instanceof Error ? error.message : t("email.securityReportFailedDescription"),
        variant: "destructive",
      });
    } finally {
      setThreatAction(null);
    }
  };

  const handleBodyLinkClick = (event: MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    const anchor = target.closest("a");
    const href = anchor?.getAttribute("href");
    if (!anchor || !href || !threatAnalysis) return;
    const finding = threatAnalysis.urlFindings.find((item) => item.url === href);
    if (finding && finding.verdict !== "safe") {
      event.preventDefault();
      setPendingDangerousLink(href);
    }
  };

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
      const result = await summarizeEmail(email.id, summaryMode, false);
      setSmartSummary(result);
      setAiSummary(result.summary);
      toast({ title: result.state === "NOT_CONFIGURED" ? t("email.aiNotConfigured") : t("email.summaryReady"), description: result.state === "NOT_CONFIGURED" ? t("email.summaryNotConfigured") : undefined, variant: result.state === "NOT_CONFIGURED" ? "default" : undefined });
    } catch (error) {
      toast({ title: t("email.summaryFailed"), description: error instanceof Error ? error.message : t("common.error"), variant: "destructive" });
    } finally {
      setAiBusy(false);
    }
  };

  const handleLoadActions = async () => {
    setActionsBusy(true);
    try {
      const result = await getEmailActions(email.id);
      setEmailActions(result.actions);
    } catch (error) {
      toast({ title: t("email.actionCenterLoadFailed"), description: error instanceof Error ? error.message : t("common.error"), variant: "destructive" });
    } finally {
      setActionsBusy(false);
    }
  };

  const handleCategorize = async () => {
    setAiBusy(true);
    try {
      const result = await categorizeEmail(email.id);
      toast({ title: `${t("email.categoryAction")}: ${result.category}` });
      await queryClient.invalidateQueries({ queryKey: getListEmailsQueryKey() });
    } catch (error) {
      toast({ title: t("email.categoryFailed"), description: error instanceof Error ? error.message : t("common.error"), variant: "destructive" });
    } finally {
      setAiBusy(false);
    }
  };

  const handleCreateFollowUp = async () => {
    if (!followUpReminder) return;
    try {
      await createFollowUp({ emailId: email.id, remindAt: new Date(followUpReminder).toISOString(), waitingForReply: true });
      toast({ title: t("email.followUpCreated") });
      setFollowUpReminder("");
    } catch (error) {
      toast({ title: t("email.followUpFailed"), description: error instanceof Error ? error.message : t("email.followUpFailed"), variant: "destructive" });
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

          <div className="flex items-center gap-1">
            <select value={summaryMode} onChange={(event) => setSummaryMode(event.target.value as SummaryMode)} aria-label={t("email.summaryMode")} className="h-8 rounded-md border bg-background px-2 text-xs">
              <option value="short">{t("email.shortSummary")}</option>
              <option value="detailed">{t("email.detailedSummary")}</option>
              <option value="key_points">{t("email.keyPoints")}</option>
              <option value="action_items">{t("email.actionItems")}</option>
            </select>
            <Button type="button" variant="ghost" size="sm" onClick={() => void handleSummarize()} disabled={aiBusy} title={t("email.summarizeThread")}>
              <Sparkles className="me-1 h-4 w-4" /> {t("email.smartSummary")}
            </Button>
          </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => void handleCategorize()} disabled={aiBusy} title={t("email.categoryAction")}>{t("email.categoryAction")}</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => void handleLoadActions()} disabled={actionsBusy} title={t("email.actionCenter")}><ListTodo className="me-1 h-4 w-4" />{t("email.actionCenter")}</Button>
          <div className="flex items-center gap-1">
            <input type="datetime-local" value={snoozeUntil} onChange={(event) => setSnoozeUntil(event.target.value)} min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)} className="h-8 w-36 rounded-md border bg-background px-1 text-xs" aria-label={t("email.snoozeUntil")} />
            <Button type="button" variant="ghost" size="sm" onClick={() => void handleSnooze()} disabled={!snoozeUntil} title={t("email.snoozeEmail")}><Clock3 className="me-1 h-4 w-4" />{t("email.snoozeEmail")}</Button>
          </div>
          <div className="flex items-center gap-1">
            <input type="datetime-local" value={followUpReminder} onChange={(event) => setFollowUpReminder(event.target.value)} min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)} className="h-8 w-36 rounded-md border bg-background px-1 text-xs" aria-label={t("email.followUpReminder")} />
            <Button type="button" variant="ghost" size="sm" onClick={() => void handleCreateFollowUp()} disabled={!followUpReminder} title={t("email.followUpReminder")}><Clock3 className="me-1 h-4 w-4" />{t("email.followUpReminder")}</Button>
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

            {smartSummary && (
              <section className="rounded-lg border border-primary/20 bg-primary/5 p-4" aria-label={t("email.smartSummary")} aria-live="polite">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary"><Sparkles className="h-4 w-4" /> {t("email.smartSummary")} <span className="text-xs font-normal text-muted-foreground">{smartSummary.providerState}</span></div>
                {smartSummary.state === "NOT_CONFIGURED" ? <p className="text-sm text-muted-foreground">{t("email.summaryNotConfigured")}</p> : null}
                {smartSummary.summary ? <p className="text-sm leading-6 text-foreground/80">{smartSummary.summary}</p> : null}
                {smartSummary.keyPoints.length > 0 ? <div className="mt-3"><h3 className="text-xs font-semibold uppercase text-muted-foreground">{t("email.keyPoints")}</h3><ul className="list-disc ps-5 text-sm">{smartSummary.keyPoints.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
                {smartSummary.actionItems.length > 0 ? <div className="mt-3"><h3 className="text-xs font-semibold uppercase text-muted-foreground">{t("email.actionItems")}</h3><ul className="list-disc ps-5 text-sm">{smartSummary.actionItems.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
                {([['importantDates', smartSummary.importantDates], ['deadlines', smartSummary.deadlines], ['amounts', smartSummary.amounts], ['peopleAndOrganizations', smartSummary.peopleAndOrganizations] ] as const).map(([key, values]) => values.length > 0 ? <div className="mt-3" key={key}><h3 className="text-xs font-semibold uppercase text-muted-foreground">{t(`email.${key}`)}</h3><ul className="list-disc ps-5 text-sm">{values.map((item) => <li key={item}>{item}</li>)}</ul></div> : null)}
                {smartSummary.suggestedNextAction ? <p className="mt-3 text-sm"><strong>{t("email.suggestedNextAction")}</strong> {smartSummary.suggestedNextAction}</p> : null}
              </section>
            )}
            {!smartSummary && aiSummary ? <p className="text-sm text-foreground/80">{aiSummary}</p> : null}
            {emailActions && (
              <section className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-4" aria-label={t("email.actionCenter")} aria-live="polite">
                <div className="mb-2 flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">{t("email.actionCenter")}</h2><span className="text-xs text-muted-foreground">{t("email.actionCenterSignals")}</span></div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {emailActions.map((item) => <div key={`${item.type}:${item.sourceSignal}`} className="rounded-lg border bg-background/70 p-3"><div className="flex items-center justify-between gap-2"><strong className="text-sm capitalize">{item.type.replaceAll("_", " ")}</strong><span className="text-xs text-muted-foreground">{Math.round(item.confidence * 100)}%</span></div><p className="mt-1 text-xs text-muted-foreground">{item.reason}</p><p className="mt-1 text-[10px] text-muted-foreground">{t("email.signal")}: {item.sourceSignal} · {t("email.requires")}: {item.permissionsRequired.join(", ")}</p></div>)}
                </div>
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

            {threatLoading ? (
              <section aria-busy="true" data-testid="threat-analysis-loading" className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                {t("email.securityChecksLoading")}
              </section>
            ) : threatAnalysis ? (
              <section data-testid="threat-analysis" aria-label={t("email.securityOverview")} className="rounded-lg border border-border bg-card p-4 shadow-sm">
                <div className="flex min-w-0 items-start gap-3">
                  <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-semibold text-foreground">{t("email.securityOverview")}</h3>
                      <span data-testid="threat-risk" className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                        {t(`email.securityState${simpleSecurityState.charAt(0).toUpperCase()}${simpleSecurityState.slice(1)}`)}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-foreground">{simpleSecurityReason}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{t(`email.securityAction${simpleSecurityState.charAt(0).toUpperCase()}${simpleSecurityState.slice(1)}`)}</p>
                    {threatAnalysis.urlFindings.some((finding) => finding.verdict !== "safe") ? (
                      <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">{t("email.suspiciousLinksWarning")}</p>
                    ) : null}
                    <details className="mt-4 rounded-md border bg-muted/20 p-3">
                      <summary className="cursor-pointer text-sm font-medium">{t("email.securityShowDetails")}</summary>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                        <span>{t("email.spf")}: <bdi dir="ltr">{threatAnalysis.spfResult}</bdi></span>
                        <span>{t("email.dkim")}: <bdi dir="ltr">{threatAnalysis.dkimResult}</bdi></span>
                        <span>{t("email.dmarc")}: <bdi dir="ltr">{threatAnalysis.dmarcResult}</bdi></span>
                        <span>{t("email.spamScore")}: <bdi dir="ltr">{threatAnalysis.spamScore}/100</bdi></span>
                        <span>{t("email.clamav")}: <bdi dir="ltr">{threatAnalysis.malwareStatus}</bdi></span>
                      </div>
                      {threatAnalysis.spamReasons.length > 0 ? <ul className="mt-3 list-disc space-y-1 ps-5 text-sm text-muted-foreground">{threatAnalysis.spamReasons.map((reason) => <li key={reason.code}>{reason.label} (+{reason.score})</li>)}</ul> : null}
                    </details>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" disabled={threatAction !== null} onClick={() => void reportThreat("spam")}>
                        {threatAction === "spam" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {t("email.reportSpam")}
                      </Button>
                      <Button type="button" size="sm" variant="outline" disabled={threatAction !== null} onClick={() => void reportThreat("phishing")}>
                        {threatAction === "phishing" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {t("email.reportPhishing")}
                      </Button>
                      <Button type="button" size="sm" variant={securityFeedback?.feedbackType === "not_spam" ? "default" : "outline"} disabled={securityFeedbackBusy} onClick={() => void saveSecurityFeedback("not_spam")}><ThumbsUp className="me-1 h-4 w-4" />{t("email.securityFeedbackNotSpam")}</Button>
                      <Button type="button" size="sm" variant={securityFeedback?.feedbackType === "spam" ? "default" : "outline"} disabled={securityFeedbackBusy} onClick={() => void saveSecurityFeedback("spam")}><ThumbsDown className="me-1 h-4 w-4" />{t("email.securityFeedbackSpam")}</Button>
                      <Button type="button" size="sm" variant={securityFeedback?.feedbackType === "not_phishing" ? "default" : "outline"} disabled={securityFeedbackBusy} onClick={() => void saveSecurityFeedback("not_phishing")}>{t("email.securityFeedbackNotPhishing")}</Button>
                      <Button type="button" size="sm" variant={securityFeedback?.feedbackType === "phishing" ? "default" : "outline"} disabled={securityFeedbackBusy} onClick={() => void saveSecurityFeedback("phishing")}>{t("email.securityFeedbackPhishing")}</Button>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            <section data-testid="ai-phishing-panel" aria-label={t("email.aiPhishingAsk")} className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold text-foreground">{t("email.aiPhishingAsk")}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{t("email.aiPhishingConsentRequired")}</p>
                </div>
                <Button type="button" size="sm" variant="outline" aria-label={t("email.aiPhishingAsk")} disabled={aiPhishingBusy || aiPhishingLoading} onClick={() => void runAiPhishingAnalysis()}>
                  {aiPhishingBusy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Sparkles className="me-2 h-4 w-4" />}
                  {aiPhishingBusy ? t("email.aiPhishingAnalyzing") : t("email.aiPhishingAsk")}
                </Button>
              </div>
              {aiPhishing && <div className="mt-4 rounded-md border bg-muted/20 p-3" data-testid="ai-phishing-result">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{aiPhishing.verdict === "not_configured" ? t("email.aiPhishingNotConfigured") : t(`email.securityState${aiPhishing.verdict.charAt(0).toUpperCase() + aiPhishing.verdict.slice(1)}`)}</span>
                  <bdi dir="ltr" className="text-sm text-muted-foreground">{t("email.aiPhishingRiskScore")}: {aiPhishing.riskScore}/100</bdi>
                </div>
                <p className="mt-2 text-sm">{aiPhishing.reasons[0]?.label || t("email.aiPhishingNotConfigured")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{aiPhishing.recommendedAction}</p>
                <details className="mt-3 rounded border p-2">
                  <summary className="cursor-pointer text-sm font-medium">{t("email.aiPhishingTechnicalDetails")}</summary>
                  <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                    <p><bdi dir="ltr">{t("email.aiPhishingProvider")}: {aiPhishing.provider}{aiPhishing.model ? ` / ${aiPhishing.model}` : ""}</bdi></p>
                    {aiPhishing.reasons.length > 0 && <div><p className="font-medium">{t("email.aiPhishingReasons")}</p><ul className="list-disc ps-5">{aiPhishing.reasons.map((reason) => <li key={`${reason.code}-${reason.label}`}>{reason.label}</li>)}</ul></div>}
                    {aiPhishing.evidence.length > 0 && <div><p className="font-medium">{t("email.aiPhishingEvidence")}</p><ul className="list-disc ps-5">{aiPhishing.evidence.map((evidence) => <li key={`${evidence.type}-${evidence.summary}`}>{evidence.summary}</li>)}</ul></div>}
                    <p><bdi dir="ltr">{new Intl.DateTimeFormat(getIntlLocale(locale), { dateStyle: "medium", timeStyle: "short" }).format(new Date(aiPhishing.analyzedAt))}</bdi></p>
                  </div>
                </details>
              </div>}
            </section>

            {pendingDangerousLink ? (
              <section role="alertdialog" aria-labelledby="dangerous-link-title" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
                <h3 id="dangerous-link-title" className="font-semibold">{t("email.dangerousLinkTitle")}</h3>
                <p className="mt-1 break-all text-sm">{t("email.dangerousLinkDescription")}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => setPendingDangerousLink(null)}>{t("email.cancelAction")}</Button>
                  <Button type="button" size="sm" onClick={() => { window.open(pendingDangerousLink, "_blank", "noopener,noreferrer"); setPendingDangerousLink(null); }}>{t("email.openAnyway")}</Button>
                </div>
              </section>
            ) : null}

            <section className="novamail-reader-body-card" onClick={handleBodyLinkClick}>
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
                    const attachmentThreatBlocked = attachment.scanStatus !== "clean" || /\.(?:exe|msi|scr|js|vbs|ps1|bat|cmd|com|jar|zip|7z|rar)$/i.test(attachment.filename);

                    return (
                      <div
                        key={`${attachment.url}-${index}`}
                        className={`novamail-reader-attachment flex items-center gap-3 rounded-lg border p-3 transition-colors group ${attachmentThreatBlocked ? "border-amber-300 bg-amber-50/60 dark:border-amber-700 dark:bg-amber-950/20" : "bg-card hover:bg-muted/50"}`}
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
                            {attachmentThreatBlocked ? (
                              <span role="alert" className="text-xs font-medium text-amber-800 dark:text-amber-200">
                                {t("email.dangerousAttachmentBlocked")}
                              </span>
                            ) : null}
                          </span>
                        </button>

                        <div className="ms-auto flex shrink-0 items-center gap-1">
                          {attachmentThreatBlocked ? (
                            <span role="alert" className="sr-only">{t("email.dangerousAttachmentBlockedDescription")}</span>
                          ) : null}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={attachmentAction !== null || attachmentThreatBlocked}
                            aria-label={t("email.openAttachment")}
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
                            disabled={attachmentAction !== null || attachmentThreatBlocked}
                            aria-label={t("email.downloadAttachment")}
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
