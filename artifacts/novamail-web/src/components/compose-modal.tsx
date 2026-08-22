import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import {
  getGetEmailQueryKey,
  getListEmailsQueryKey,
  useSendEmail,
  useTrashEmail,
  useUpdateDraft,
  useCancelEmailSend,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/hooks/use-i18n";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, Italic, Bold, List, Loader2, Paperclip, Save, Send, Trash2, Underline, X } from "lucide-react";
import { UndoToast } from "@/components/undo-toast";
import { aiWrite, FeatureRequestError, listTemplates, type AiWriteOperation } from "@/lib/feature-api";

const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_SIZE = 50 * 1024 * 1024;

export type ComposeAttachment = {
  filename: string;
  url: string;
  size: number;
  mimeType: string;
};

const composeSchema = z.object({
  to: z.string().optional(),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  subject: z.string().optional(),
  bodyText: z.string().optional(),
});

type ComposeValues = z.infer<typeof composeSchema>;

function parseRecipients(value: string): string[] {
  return value
    .split(/[;,]/)
    .map((email) => email.trim())
    .filter(Boolean);
}

function areRecipientsValid(recipients: string[]): boolean {
  return recipients.every((email) => z.string().email().safeParse(email).success);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatFileSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function mergeAttachments(attachments: ComposeAttachment[]): ComposeAttachment[] {
  const attachmentsByKey = new Map<string, ComposeAttachment>();

  for (const attachment of attachments) {
    const key =
      attachment.url || `${attachment.filename}:${attachment.size}:${attachment.mimeType}`;
    attachmentsByKey.set(key, attachment);
  }

  return Array.from(attachmentsByKey.values());
}

function stripHtml(value: string): string {
  if (typeof document === "undefined") return value.replace(/<[^>]+>/g, " ").trim();
  const container = document.createElement("div");
  container.innerHTML = value;
  return (container.textContent || container.innerText || "").replace(/\u00a0/g, " ").trim();
}

function asEditorHtml(value: string): string {
  if (!value) return "";
  return /<([a-z][\s\S]*?)>/i.test(value) ? value : `<p>${escapeHtml(value).replace(/\n/g, "<br />")}</p>`;
}

async function fetchWithAuth(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const request = (accessToken: string | null) => {
    const headers = new Headers(init.headers);
    if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
    return fetch(input, { ...init, headers });
  };

  let accessToken = localStorage.getItem("novamail-access");
  let response = await request(accessToken);
  if (response.status !== 401) return response;

  const refreshToken = localStorage.getItem("novamail-refresh");
  if (!refreshToken) return response;

  const refreshResponse = await fetch("/api/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!refreshResponse.ok) return response;

  const authData = (await refreshResponse.json()) as {
    accessToken: string;
    refreshToken: string;
    user?: unknown;
  };
  localStorage.setItem("novamail-access", authData.accessToken);
  localStorage.setItem("novamail-refresh", authData.refreshToken);
  if (authData.user) {
    localStorage.setItem("novamail-user", JSON.stringify(authData.user));
  }

  return request(authData.accessToken);
}

async function deleteUncommittedAttachment(url: string): Promise<void> {
  const response = await fetchWithAuth(url, { method: "DELETE" });
  if (!response.ok && response.status !== 404 && response.status !== 409) {
    throw new Error(`Failed to clean up attachment (HTTP ${response.status})`);
  }
}

async function uploadAttachment(file: File): Promise<ComposeAttachment> {
  const response = await fetchWithAuth("/api/emails/attachments", {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "X-File-Name": encodeURIComponent(file.name),
    },
    body: file,
  });

  const responseBody = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      responseBody &&
      typeof responseBody === "object" &&
      "error" in responseBody &&
      typeof responseBody.error === "string"
        ? responseBody.error
        : "Failed to upload attachment";

    throw new Error(message);
  }

  return responseBody as ComposeAttachment;
}

interface ComposeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draftId?: string;
  replyToId?: string;
  defaultTo?: string;
  defaultCc?: string;
  defaultBcc?: string;
  defaultSubject?: string;
  defaultBody?: string;
  defaultAttachments?: ComposeAttachment[];
  inReplyTo?: string;
  references?: string[];
}

export function ComposeModal({
  open,
  onOpenChange,
  draftId,
  replyToId,
  defaultTo,
  defaultCc,
  defaultBcc,
  defaultSubject,
  defaultBody,
  defaultAttachments,
  inReplyTo,
  references,
}: ComposeModalProps) {
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const sendEmailMutation = useSendEmail();
  const updateDraftMutation = useUpdateDraft();
  const trashEmailMutation = useTrashEmail();
  const cancelEmailMutation = useCancelEmailSend();

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const editorRef = React.useRef<HTMLDivElement>(null);
  const uploadedThisSessionRef = React.useRef<Set<string>>(new Set());

  const [selectedFiles, setSelectedFiles] = React.useState<File[]>([]);
  const [savedAttachments, setSavedAttachments] = React.useState<ComposeAttachment[]>([]);
  const [isUploading, setIsUploading] = React.useState(false);
  const [undoDelaySeconds, setUndoDelaySeconds] = React.useState(8);
  const [scheduledAt, setScheduledAt] = React.useState("");
  const [aiBusy, setAiBusy] = React.useState(false);
  const [aiPrompt, setAiPrompt] = React.useState("");
  const [aiSuggestion, setAiSuggestion] = React.useState<{ text: string; operation: AiWriteOperation } | null>(null);
  const [templates, setTemplates] = React.useState<Array<{ id: string; name: string; subject: string; bodyHtml: string; bodyText: string }>>([]);
  const [undoToast, setUndoToast] = React.useState<{ emailId: string; durationSeconds: number } | null>(null);
  const [recipientChips, setRecipientChips] = React.useState<Record<"to" | "cc" | "bcc", string[]>>({ to: [], cc: [], bcc: [] });
  const [recipientInputs, setRecipientInputs] = React.useState<Record<"to" | "cc" | "bcc", string>>({ to: "", cc: "", bcc: "" });

  const form = useForm<ComposeValues>({
    resolver: zodResolver(composeSchema),
    defaultValues: {
      to: defaultTo || "",
      cc: defaultCc || "",
      bcc: defaultBcc || "",
      subject: defaultSubject || "",
      bodyText: defaultBody || "",
    },
  });

  React.useEffect(() => {
    if (!open) {
      return;
    }

    void listTemplates().then((result) => setTemplates(result.templates)).catch(() => undefined);

    const initialRecipients = {
      to: parseRecipients(defaultTo || ""),
      cc: parseRecipients(defaultCc || ""),
      bcc: parseRecipients(defaultBcc || ""),
    };
    setRecipientChips(initialRecipients);
    setRecipientInputs({ to: "", cc: "", bcc: "" });
    form.reset({
      to: initialRecipients.to.join(", "),
      cc: initialRecipients.cc.join(", "),
      bcc: initialRecipients.bcc.join(", "),
      subject: defaultSubject || "",
      bodyText: defaultBody || "",
    });

    setSelectedFiles([]);
    setSavedAttachments(mergeAttachments(defaultAttachments || []));
    setUndoDelaySeconds(8);
    setScheduledAt("");
    setAiSuggestion(null);
    uploadedThisSessionRef.current.clear();
    if (editorRef.current) {
      editorRef.current.innerHTML = asEditorHtml(defaultBody || "");
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [open, draftId, replyToId, defaultTo, defaultCc, defaultBcc, defaultSubject, defaultBody, defaultAttachments, form]);

  const syncRecipientField = (fieldName: "to" | "cc" | "bcc", chips: string[], input = recipientInputs[fieldName]) => {
    setRecipientChips((current) => ({ ...current, [fieldName]: chips }));
    setRecipientInputs((current) => ({ ...current, [fieldName]: input }));
    form.setValue(fieldName, [...chips, input].filter(Boolean).join(", "), { shouldDirty: true });
  };

  const commitRecipientInput = (fieldName: "to" | "cc" | "bcc") => {
    const incoming = parseRecipients(recipientInputs[fieldName]);
    if (!incoming.length) return;
    const next = Array.from(new Set([...recipientChips[fieldName], ...incoming]));
    syncRecipientField(fieldName, next, "");
  };

  const handleRecipientKeyDown = (event: React.KeyboardEvent<HTMLInputElement>, fieldName: "to" | "cc" | "bcc") => {
    if (event.key === "," || event.key === "Enter") {
      event.preventDefault();
      commitRecipientInput(fieldName);
    }
  };

  const renderRecipientChipField = (fieldName: "to" | "cc" | "bcc", label: string, placeholder: string) => (
    <FormField
      control={form.control}
      name={fieldName}
      render={({ field }) => (
        <FormItem className="flex-1 space-y-0 min-w-0">
          <FormControl>
            <div className="flex min-h-8 flex-1 flex-wrap items-center gap-1.5">
              {recipientChips[fieldName].map((recipient) => {
                const valid = z.string().email().safeParse(recipient).success;
                return <span key={`${fieldName}-${recipient}`} className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-1 text-xs ${valid ? "border-primary/20 bg-primary/10 text-foreground" : "border-destructive/50 bg-destructive/10 text-destructive"}`}>
                  <bdi dir="ltr" className="max-w-[14rem] truncate">{recipient}</bdi>
                  <button type="button" className="rounded-full p-0.5 hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={`${t("email.removeRecipient")}: ${recipient}`} onClick={() => syncRecipientField(fieldName, recipientChips[fieldName].filter((item) => item !== recipient))} disabled={isBusy}><X className="h-3 w-3" /></button>
                </span>;
              })}
              <Input
                dir="ltr"
                aria-label={label}
                aria-invalid={recipientInputs[fieldName].length > 0 && !areRecipientsValid(parseRecipients(recipientInputs[fieldName]))}
                placeholder={recipientChips[fieldName].length ? t("email.addRecipient") : placeholder}
                className="min-w-[10rem] flex-1 border-0 focus-visible:ring-0 shadow-none px-0 h-8 text-sm bg-transparent text-left"
                disabled={isBusy}
                value={recipientInputs[fieldName]}
                onChange={(event) => { setRecipientInputs((current) => ({ ...current, [fieldName]: event.target.value })); field.onChange([...recipientChips[fieldName], event.target.value].filter(Boolean).join(", ")); }}
                onKeyDown={(event) => handleRecipientKeyDown(event, fieldName)}
                onBlur={() => commitRecipientInput(fieldName)}
              />
              {recipientInputs[fieldName].trim() ? (
                <p className="basis-full text-xs text-muted-foreground" role="status" aria-live="polite">
                  {t("email.noContactsFound")} · {t("email.autocompleteUnavailable")}
                </p>
              ) : null}
            </div>
          </FormControl>
          <FormMessage className="text-xs" />
        </FormItem>
      )}
    />
  );

  const handleFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const incomingFiles = Array.from(event.target.files || []);

    const oversizedFile = incomingFiles.find((file) => file.size > MAX_ATTACHMENT_SIZE);

    if (oversizedFile) {
      toast({
        title: t("email.attachmentTooLarge"),
        description: t("email.attachmentTooLargeDescription", { name: oversizedFile.name }),
        variant: "destructive",
      });

      event.target.value = "";
      return;
    }

    const filesByKey = new Map<string, File>();
    for (const file of [...selectedFiles, ...incomingFiles]) {
      const key = [file.name, file.size, file.lastModified].join(":");
      filesByKey.set(key, file);
    }

    const totalSize =
      savedAttachments.reduce((total, attachment) => total + attachment.size, 0) +
      Array.from(filesByKey.values()).reduce((total, file) => total + file.size, 0);

    if (totalSize > MAX_TOTAL_ATTACHMENT_SIZE) {
      toast({
        title: t("email.attachmentsTooLarge"),
        description: t("email.attachmentsTooLargeDescription"),
        variant: "destructive",
      });
      event.target.value = "";
      return;
    }

    setSelectedFiles(Array.from(filesByKey.values()));

    event.target.value = "";
  };

  const removeSelectedFile = (fileToRemove: File) => {
    setSelectedFiles((currentFiles) => currentFiles.filter((file) => file !== fileToRemove));
  };

  const removeSavedAttachment = (attachmentToRemove: ComposeAttachment) => {
    setSavedAttachments((currentAttachments) =>
      currentAttachments.filter((attachment) => attachment.url !== attachmentToRemove.url),
    );

    if (uploadedThisSessionRef.current.delete(attachmentToRemove.url)) {
      void deleteUncommittedAttachment(attachmentToRemove.url).catch(() => undefined);
    }
  };

  const clearAndClose = (persisted = false) => {
    const uncommittedUrls = persisted ? [] : Array.from(uploadedThisSessionRef.current);
    uploadedThisSessionRef.current.clear();

    if (uncommittedUrls.length > 0) {
      void Promise.allSettled(uncommittedUrls.map((url) => deleteUncommittedAttachment(url)));
    }

    form.reset();
    setSelectedFiles([]);
    setSavedAttachments([]);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    onOpenChange(false);
  };

  const invalidateEmailLists = async () => {
    await queryClient.invalidateQueries({
      queryKey: getListEmailsQueryKey(),
    });
  };

  const closeUndoToast = React.useCallback(() => {
    setUndoToast(null);
  }, []);

  const handleUndoSend = React.useCallback(async () => {
    if (!undoToast) return;
    try {
      await cancelEmailMutation.mutateAsync({ id: undoToast.emailId });
      setUndoToast(null);
      toast({ title: "Sending cancelled" });
      await invalidateEmailLists();
    } catch (error: unknown) {
      toast({
        title: "Could not cancel sending",
        description: error instanceof Error ? error.message : "The message may already be sent.",
        variant: "destructive",
      });
    }
  }, [cancelEmailMutation, invalidateEmailLists, toast, undoToast]);

  const handleSaveOrSend = async (values: ComposeValues, sendNow: boolean) => {
    form.clearErrors();

    const recipientText = values.to?.trim() || "";
    const recipients = parseRecipients(recipientText);
    const ccRecipients = parseRecipients(values.cc?.trim() || "");
    const bccRecipients = parseRecipients(values.bcc?.trim() || "");
    const subject = values.subject?.trim() || "";
    const bodyHtml = values.bodyText || "";
    const bodyText = stripHtml(bodyHtml);
    const plannedDate = scheduledAt ? new Date(scheduledAt) : null;
    if (sendNow && plannedDate && (Number.isNaN(plannedDate.getTime()) || plannedDate.getTime() <= Date.now())) {
      toast({ title: "Choose a future date and time", variant: "destructive" });
      return;
    }

    if (![...recipients, ...ccRecipients, ...bccRecipients].every((email) => z.string().email().safeParse(email).success)) {
      const invalidMessage = t("email.invalidRecipients");
      form.setError("to", {
        message: invalidMessage,
      });
      form.setFocus("to");
      toast({
        title: invalidMessage,
        variant: "destructive",
      });
      return;
    }

    if (sendNow && recipients.length === 0) {
      form.setError("to", {
        message: t("email.recipientRequired"),
      });
      return;
    }

    if (sendNow && !subject) {
      form.setError("subject", {
        message: t("email.subjectRequired"),
      });
      return;
    }

    setIsUploading(selectedFiles.length > 0);

    try {
      const uploadResults =
        selectedFiles.length > 0
          ? await Promise.allSettled(selectedFiles.map(uploadAttachment))
          : [];
      const newlyUploadedAttachments: ComposeAttachment[] = [];
      const failedFiles: File[] = [];
      let uploadFailed = false;
      let firstUploadError: unknown = null;

      uploadResults.forEach((result, index) => {
        if (result.status === "fulfilled") {
          newlyUploadedAttachments.push(result.value);
          uploadedThisSessionRef.current.add(result.value.url);
        } else {
          const failedFile = selectedFiles[index];
          if (failedFile) failedFiles.push(failedFile);
          uploadFailed = true;
          firstUploadError ??= result.reason;
        }
      });

      const attachments = mergeAttachments([...savedAttachments, ...newlyUploadedAttachments]);

      if (newlyUploadedAttachments.length > 0) {
        setSavedAttachments(attachments);
      }
      if (selectedFiles.length > 0) {
        setSelectedFiles(failedFiles);
      }
      if (uploadFailed) {
        throw firstUploadError ?? new Error("One or more attachments failed to upload");
      }

      const commonData = {
        to: recipients.map((email) => ({ email })),
        cc: ccRecipients.map((email) => ({ email })),
        bcc: bccRecipients.map((email) => ({ email })),
        subject,
        bodyHtml: bodyHtml || `<p>${escapeHtml(bodyText).replace(/\n/g, "<br/>")}</p>`,
        bodyText,
        attachments,
        replyToId: replyToId || undefined,
        inReplyTo: inReplyTo || undefined,
        references,
        scheduledAt: plannedDate ? plannedDate.toISOString() : undefined,
        undoDelaySeconds: plannedDate ? undefined : undoDelaySeconds,
      };

      let savedEmail: {
        id?: string;
        threadId?: string | null;
        status?: string;
        scheduledAt?: string | null;
      };

      if (draftId) {
        savedEmail = (await updateDraftMutation.mutateAsync({
          id: draftId,
          data: {
            ...commonData,
            sendNow,
          },
        })) as {
          id?: string;
          threadId?: string | null;
        };
      } else {
        savedEmail = (await sendEmailMutation.mutateAsync({
          data: {
            ...commonData,
            isDraft: !sendNow,
          },
        })) as {
          id?: string;
          threadId?: string | null;
        };
      }

      const queuedForUndo = sendNow && savedEmail.status === "pending_send" && savedEmail.id;
      if (queuedForUndo) {
        setUndoToast({ emailId: savedEmail.id!, durationSeconds: undoDelaySeconds });
      } else {
        toast({
          title: sendNow
            ? savedEmail.status === "scheduled"
              ? "Email scheduled"
              : replyToId
                ? "Reply sent"
                : "Email sent"
            : draftId
              ? "Draft updated"
              : "Draft saved",
        });
      }

      await invalidateEmailLists();

      const emailDetailIds = new Set(
        [replyToId, draftId, savedEmail.id, savedEmail.threadId].filter((id): id is string =>
          Boolean(id),
        ),
      );

      await Promise.all(
        Array.from(emailDetailIds).map((id) =>
          queryClient.invalidateQueries({
            queryKey: getGetEmailQueryKey(id),
          }),
        ),
      );

      window.dispatchEvent(
        new CustomEvent("novamail:thread-updated", {
          detail: {
            ids: Array.from(emailDetailIds),
          },
        }),
      );

      clearAndClose(true);
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : sendNow
            ? "Failed to send email"
            : "Failed to save draft";

      toast({
        title: t("common.error"),
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const applyAiSuggestion = () => {
    if (!aiSuggestion) return;
    if (editorRef.current) editorRef.current.innerHTML = asEditorHtml(aiSuggestion.text);
    form.setValue("bodyText", aiSuggestion.text, { shouldDirty: true });
    setAiSuggestion(null);
    toast({ title: t("email.applyAiSuggestion") });
  };

  const handleAiAssist = async (operation: AiWriteOperation) => {
    const currentBody = editorRef.current?.innerText || stripHtml(String(form.getValues("bodyText") || ""));
    if (operation === "draft" && !aiPrompt.trim() && !currentBody.trim()) {
      toast({ title: "Describe the email you want to write first.", variant: "destructive" });
      return;
    }
    setAiBusy(true);
    try {
      const result = await aiWrite({
        operation,
        instruction: aiPrompt,
        context: `Subject: ${form.getValues("subject") || ""}\nCurrent draft: ${currentBody}`,
        threadText: replyToId ? currentBody : undefined,
      });
      setAiSuggestion({ text: result.text, operation });
      toast({ title: t("email.reviewAiSuggestion"), description: t("email.aiActionRequiresConfirmation") });
    } catch (error) {
      const notConfigured =
        (error instanceof FeatureRequestError && error.status === 503) ||
        (error instanceof Error && /not configured|unavailable/i.test(error.message));
      toast({
        title: notConfigured ? t("email.aiNotConfigured") : t("common.error"),
        description: notConfigured ? t("email.aiNotConfigured") : error instanceof Error ? error.message : t("common.error"),
        variant: "destructive",
      });
    } finally {
      setAiBusy(false);
    }
  };

  const handleTemplateInsert = (templateId: string) => {
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    if (template.subject) form.setValue("subject", template.subject, { shouldDirty: true });
    const body = template.bodyHtml || template.bodyText;
    if (editorRef.current) editorRef.current.innerHTML = asEditorHtml(body);
    form.setValue("bodyText", body, { shouldDirty: true });
  };

  const handleDeleteDraft = async () => {
    if (!draftId) {
      return;
    }

    try {
      await trashEmailMutation.mutateAsync({
        id: draftId,
      });

      toast({
        title: t("email.draftMovedToTrash"),
      });

      await invalidateEmailLists();
      clearAndClose(true);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to delete draft";

      toast({
        title: t("common.error"),
        description: message,
        variant: "destructive",
      });
    }
  };

  const isBusy =
    isUploading ||
    sendEmailMutation.isPending ||
    updateDraftMutation.isPending ||
    trashEmailMutation.isPending ||
    cancelEmailMutation.isPending ||
    aiBusy;

  const isRtl =
    typeof document !== "undefined" && document.documentElement.dir.toLowerCase() === "rtl";

  return (
    <>
      <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isBusy) return;
        if (nextOpen) onOpenChange(true);
        else clearAndClose(false);
      }}
    >
      <DialogContent
        className="
          novamail-compose-modal
          left-0 top-0 h-[100dvh] max-h-none w-screen max-w-none
          translate-x-0 translate-y-0 rounded-none border-0
          compose-dialog p-0 gap-0 overflow-hidden flex flex-col
          sm:left-[50%] sm:top-[50%]
          sm:h-[80vh] sm:max-h-[800px]
          sm:w-full sm:max-w-[600px]
          sm:-translate-x-1/2 sm:-translate-y-1/2
          sm:rounded-lg sm:border
        "
      >
        <DialogHeader
          dir={isRtl ? "rtl" : "ltr"}
          className="novamail-compose-header px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] border-b bg-muted/30"
        >
          <DialogTitle className="text-sm font-medium text-start">
            {draftId
              ? t("email.editDraft")
              : replyToId
                ? t("email.replyMessage")
                : t("email.newMessage")}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => handleSaveOrSend(values, true))}
            dir={isRtl ? "rtl" : "ltr"}
            className="novamail-compose-form flex flex-col flex-1 overflow-hidden"
          >
            <div className="novamail-compose-field px-4 py-2 border-b flex items-center gap-3">
              <span className="text-muted-foreground text-sm w-14 shrink-0 text-start">
                {t("email.to")}:
              </span>

              {renderRecipientChipField("to", t("email.to"), t("email.recipientPlaceholder"))}
            </div>

            <div className="novamail-compose-field px-4 py-2 border-b flex items-center gap-3">
              <span className="text-muted-foreground text-sm w-14 shrink-0 text-start">{t("email.cc")}:</span>
              {renderRecipientChipField("cc", t("email.cc"), t("email.recipientPlaceholder"))}
            </div>

            <div className="novamail-compose-field px-4 py-2 border-b flex items-center gap-3">
              <span className="text-muted-foreground text-sm w-14 shrink-0 text-start">{t("email.bcc")}:</span>
              {renderRecipientChipField("bcc", t("email.bcc"), t("email.recipientPlaceholder"))}
            </div>

            <div className="novamail-compose-field px-4 py-2 border-b flex items-center gap-3">
              <span className="text-muted-foreground text-sm w-14 shrink-0 text-start">
                {t("email.subject")}:
              </span>

              <FormField
                control={form.control}
                name="subject"
                render={({ field }) => (
                  <FormItem className="flex-1 space-y-0 min-w-0">
                    <FormControl>
                      <Input
                        dir="auto"
                        placeholder={t("email.subject")}
                        className="novamail-compose-subject mixed-direction-input border-0 focus-visible:ring-0 shadow-none px-0 h-8 text-sm bg-transparent text-start"
                        disabled={isBusy}
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>

                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
            </div>

            <div className="novamail-compose-body flex-1 overflow-hidden flex flex-col">
              <div className="flex items-center gap-1 border-b px-3 py-2 bg-muted/10">
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={isBusy} onClick={() => document.execCommand("bold")} title="Bold"><Bold className="h-4 w-4" /></Button>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={isBusy} onClick={() => document.execCommand("italic")} title="Italic"><Italic className="h-4 w-4" /></Button>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={isBusy} onClick={() => document.execCommand("underline")} title="Underline"><Underline className="h-4 w-4" /></Button>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={isBusy} onClick={() => document.execCommand("insertUnorderedList")} title="Bulleted list"><List className="h-4 w-4" /></Button>
                <div className="ms-2 flex min-w-0 flex-1 items-center gap-1">
                  <Input
                    value={aiPrompt}
                    onChange={(event) => setAiPrompt(event.target.value)}
                    placeholder={t("email.aiPromptPlaceholder")}
                    className="h-8 min-w-0 flex-1 text-xs"
                    disabled={isBusy}
                  />
                  <Button type="button" size="sm" variant="secondary" onClick={() => void handleAiAssist("draft")} disabled={isBusy} className="h-8 px-2 text-xs">{t("email.aiWriteAction")}</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => void handleAiAssist("rephrase")} disabled={isBusy} className="h-8 px-2 text-xs">{t("email.rephraseAction")}</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => void handleAiAssist("shorten")} disabled={isBusy} className="h-8 px-2 text-xs">{t("email.shortenAction")}</Button>
                  {replyToId && <Button type="button" size="sm" variant="ghost" onClick={() => void handleAiAssist("quick_reply")} disabled={isBusy} className="h-8 px-2 text-xs">{t("email.quickReplyAction")}</Button>}
                  {templates.length > 0 && (
                    <select aria-label="Insert template" defaultValue="" onChange={(event) => handleTemplateInsert(event.target.value)} disabled={isBusy} className="h-8 max-w-28 rounded-md border bg-background px-1 text-xs">
                      <option value="">Template</option>
                      {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                    </select>
                  )}
                </div>
              </div>
              {aiSuggestion ? (
                <div className="border-b border-primary/20 bg-primary/[0.04] p-3" role="region" aria-label={t("email.reviewAiSuggestion")}>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-primary">{t("email.reviewAiSuggestion")}</p>
                    <p className="text-xs text-muted-foreground">{t("email.aiActionRequiresConfirmation")}</p>
                  </div>
                  <p className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border/60 bg-background p-3 text-sm" dir="auto">{aiSuggestion.text}</p>
                  <div className="mt-2 flex flex-wrap justify-end gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => setAiSuggestion(null)} disabled={isBusy}>{t("email.cancelAiSuggestion")}</Button>
                    <Button type="button" size="sm" onClick={applyAiSuggestion} disabled={isBusy}>{t("email.applyAiSuggestion")}</Button>
                  </div>
                </div>
              ) : null}
              <FormField
                control={form.control}
                name="bodyText"
                render={({ field }) => (
                  <FormItem className="h-full space-y-0 flex-1">
                    <FormControl>
                      <div
                        ref={editorRef}
                        dir="auto"
                        contentEditable={!isBusy}
                        role="textbox"
                        aria-multiline="true"
                        data-placeholder={t("email.writeMessage")}
                        className="novamail-compose-message mixed-direction-input border-0 focus-visible:outline-none p-4 text-sm leading-7 bg-transparent text-start h-full overflow-y-auto [&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-muted-foreground"
                        onInput={(event) => field.onChange(event.currentTarget.innerHTML)}
                        onBlur={(event) => field.onChange(event.currentTarget.innerHTML)}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {(savedAttachments.length > 0 || selectedFiles.length > 0) && (
              <div className="novamail-compose-attachments border-t px-3 py-2 max-h-40 overflow-y-auto">
                <div className="flex flex-col gap-2">
                  {savedAttachments.map((attachment) => (
                    <div
                      key={attachment.url}
                      className="novamail-compose-attachment flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-2"
                    >
                      {attachment.mimeType.startsWith("image/") ? (
                        <img src={attachment.url} alt="" className="h-10 w-10 rounded object-cover border" />
                      ) : (
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}

                      <div className="min-w-0 flex-1">
                        <p dir="auto" className="truncate text-sm font-medium">
                          {attachment.filename}
                        </p>

                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(attachment.size)}
                        </p>
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => removeSavedAttachment(attachment)}
                        disabled={isBusy}
                        title={t("email.removeAttachment")}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}

                  {selectedFiles.map((file) => (
                    <div
                      key={`${file.name}-${file.size}-${file.lastModified}`}
                      className="novamail-compose-attachment flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-2"
                    >
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />

                      <div className="min-w-0 flex-1">
                        <p dir="auto" className="truncate text-sm font-medium">
                          {file.name}
                        </p>

                        <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => removeSelectedFile(file)}
                        disabled={isBusy}
                        title={t("email.removeAttachment")}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="compose-footer novamail-compose-footer p-3 border-t bg-muted/20 flex flex-wrap justify-between items-center gap-2">
              <div className="compose-footer__secondary flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => clearAndClose(false)}
                  disabled={isBusy}
                >
                  {t("common.cancel")}
                </Button>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileSelection}
                  disabled={isBusy}
                />

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isBusy}
                  title={t("email.attachFiles")}
                >
                  <Paperclip className="h-4 w-4" />
                </Button>

                {draftId && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={handleDeleteDraft}
                    disabled={isBusy}
                    title={t("email.deleteDraft")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

                <div className="compose-footer__primary flex items-center gap-2 flex-wrap justify-end">
                <details className="relative rounded-lg border border-border/60 bg-background px-2 py-1">
                  <summary className="cursor-pointer list-none text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{t("email.deliveryOptions")}</summary>
                <div className="mt-2 flex flex-col gap-2 border-t border-border/60 pt-2 text-xs text-muted-foreground sm:absolute sm:bottom-full sm:end-0 sm:mb-2 sm:w-72 sm:rounded-xl sm:border sm:bg-card sm:p-3 sm:shadow-lg">
                  <label htmlFor="scheduled-at">{t("email.schedule")}</label>
                  <Input
                    id="scheduled-at"
                    type="datetime-local"
                    value={scheduledAt}
                    min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
                    onChange={(event) => setScheduledAt(event.target.value)}
                    disabled={isBusy}
                    className="h-8 w-[175px] text-xs"
                  />
                  {!scheduledAt && (
                    <label className="flex items-center gap-2 text-xs text-muted-foreground" htmlFor="undo-send-delay">
                      <span>{t("email.undoSendDelay")}</span>
                      <select id="undo-send-delay" aria-label={t("email.undoSendDelay")} value={undoDelaySeconds} onChange={(event) => setUndoDelaySeconds(Number(event.target.value))} disabled={isBusy} className="h-8 rounded-md border bg-background px-2 text-xs text-foreground">
                        {[5, 8, 10, 15, 20, 30].map((seconds) => <option key={seconds} value={seconds}>{seconds}s</option>)}
                      </select>
                    </label>
                  )}
                </div>
                </details>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  disabled={isBusy}
                  onClick={form.handleSubmit((values) => handleSaveOrSend(values, false))}
                >
                  {isBusy && !isUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  <span>{t("email.saveDraft")}</span>
                </Button>

                <Button type="submit" disabled={isBusy} size="sm" className="gap-2">
                  {isBusy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {isUploading ? t("email.uploading") : t("common.loading")}
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      <span>{t("email.send")}</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
      </Dialog>
      {undoToast && (
        <UndoToast
          durationSeconds={undoToast.durationSeconds}
          onUndo={() => void handleUndoSend()}
          onClose={closeUndoToast}
        />
      )}
    </>
  );
}
