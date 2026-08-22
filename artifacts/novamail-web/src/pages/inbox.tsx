import { useEffect, useState } from "react";
import React from "react";
import { useLocation, useParams } from "wouter";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Inbox as InboxIcon, Menu, MoreHorizontal, Send, Star } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { EmailList } from "@/components/email-list";
import { EmailDetail } from "@/components/email-detail";
import { ComposeModal, type ComposeAttachment } from "@/components/compose-modal";
import {
  useListEmails,
  getEmail,
  getGetEmailQueryKey,
  useMoveEmail,
  type Email,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isRtlLocale } from "@/lib/i18n-config";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { getGmailStatus, syncGmail } from "../lib/gmail-api";
import { getGetInboxStatsQueryKey, getListEmailsQueryKey } from "@workspace/api-client-react";

import { EmailVerificationBanner } from "@/components/email-verification-banner";
import { BrandMark } from "@/components/brand-mark";
import { TwoFactorBanner } from "@/components/two-factor-banner";

type ComposeDefaults = {
  draftId?: string;
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  body?: string;
  replyToId?: string;
  inReplyTo?: string;
  references?: string[];
  attachments?: ComposeAttachment[];
};

function addSubjectPrefix(subject: string, prefix: "Re:" | "Fwd:"): string {
  const cleanSubject = subject.trim() || "(No subject)";

  return cleanSubject.toLowerCase().startsWith(prefix.toLowerCase())
    ? cleanSubject
    : `${prefix} ${cleanSubject}`;
}

function formatAddress(address: { email: string; name?: string | null }): string {
  return address.name ? `${address.name} <${address.email}>` : address.email;
}

const QUOTED_MESSAGE_MARKER =
  /(?:^\s*-{5,}\s*(?:Original message|Forwarded message)\s*-{5,}\s*$|^\s*On .+\bwrote:\s*$|^\s*في .+(?:كتب|كتبت).*:\s*$|^\s*>)/im;

function removeQuotedHistory(bodyText: string): string {
  const markerMatch = QUOTED_MESSAGE_MARKER.exec(bodyText);

  if (!markerMatch || markerMatch.index === undefined) {
    return bodyText.trim();
  }

  return bodyText.slice(0, markerMatch.index).trim();
}

function createQuotedMessage(email: Email, heading: string): string {
  const recipients = email.to.map(formatAddress).join(", ");

  const messageDate = new Date(email.sentAt || email.createdAt).toLocaleString();

  const latestMessageText = removeQuotedHistory(email.bodyText || "");

  return [
    `---------- ${heading} ----------`,
    `From: ${formatAddress(email.from)}`,
    `Date: ${messageDate}`,
    `Subject: ${email.subject || "(No subject)"}`,
    `To: ${recipients}`,
    "",
    latestMessageText,
  ].join("\n");
}

function getComposeAttachments(email: Email): ComposeAttachment[] {
  return (email.attachments || []).map((attachment) => ({
    filename: attachment.filename,
    url: attachment.url,
    size: attachment.size,
    mimeType: attachment.mimeType,
  }));
}

function removeDuplicateRecipients(
  addresses: Array<{
    email: string;
    name?: string | null;
  }>,
  currentUserEmail?: string,
): string[] {
  const uniqueEmails = new Map<string, string>();

  const normalizedCurrentEmail = currentUserEmail?.trim().toLowerCase();

  for (const address of addresses) {
    const email = address.email?.trim();

    if (!email) {
      continue;
    }

    const normalizedEmail = email.toLowerCase();

    if (normalizedCurrentEmail && normalizedEmail === normalizedCurrentEmail) {
      continue;
    }

    if (!uniqueEmails.has(normalizedEmail)) {
      uniqueEmails.set(normalizedEmail, email);
    }
  }

  return Array.from(uniqueEmails.values());
}

/** Translate a system folder slug to a user-facing label. */
function useFolderLabel(folder: string) {
  const { t } = useI18n();
  const key = `folder.${folder}`;
  const translated = t(key);
  // Fall back to capitalised slug for custom folders
  return translated !== key ? translated : folder.charAt(0).toUpperCase() + folder.slice(1);
}

export default function Inbox() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const folder = params.folder || "inbox";
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const moveEmailMutation = useMoveEmail();
  const folderLabel = useFolderLabel(folder);

  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("email");
  });

  const openSelectedEmail = (id: string) => {
    if (!selectedEmailId) {
      const url = new URL(window.location.href);
      url.searchParams.set("email", id);

      window.history.pushState(
        {
          ...window.history.state,
          __zephyxEmailDetail: true,
          __zephyxEmailId: id,
        },
        "",
        url.toString(),
      );
    } else {
      const url = new URL(window.location.href);
      url.searchParams.set("email", id);

      window.history.replaceState(
        {
          ...window.history.state,
          __zephyxEmailDetail: true,
          __zephyxEmailId: id,
        },
        "",
        url.toString(),
      );
    }

    setSelectedEmailId(id);
  };

  const closeSelectedEmail = () => {
    if (window.history.state?.__zephyxEmailDetail) {
      window.history.back();
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.delete("email");

    window.history.replaceState(
      {
        ...window.history.state,
        __zephyxEmailDetail: false,
        __zephyxEmailId: undefined,
      },
      "",
      url.toString(),
    );

    setSelectedEmailId(null);
  };

  useEffect(() => {
    const handleBrowserBack = () => {
      const emailId = new URLSearchParams(window.location.search).get("email");
      setSelectedEmailId(emailId);
    };

    window.addEventListener("popstate", handleBrowserBack);

    return () => {
      window.removeEventListener("popstate", handleBrowserBack);
    };
  }, []);

  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [hasAttachments, setHasAttachments] = useState<boolean | undefined>(undefined);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [sizeMin, setSizeMin] = useState("");
  const [sizeMax, setSizeMax] = useState("");
  const [labelFilter, setLabelFilter] = useState("");

  const [isComposeOpen, setIsComposeOpen] = useState(false);

  const [composeDefaults, setComposeDefaults] = useState<ComposeDefaults>({});

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const standardFolders = [
    "inbox",
    "sent",
    "drafts",
    "starred",
    "archive",
    "trash",
    "spam",
    "snoozed",
  ];

  const isCustomFolder = !standardFolders.includes(folder);

  const queryParams = {
    folder: isCustomFolder ? undefined : (folder as any),

    folderId: isCustomFolder ? folder : undefined,

    search: searchQuery || undefined,
    dateFrom: dateFrom ? new Date(`${dateFrom}T00:00:00`).toISOString() : undefined,
    dateTo: dateTo ? new Date(`${dateTo}T23:59:59.999`).toISOString() : undefined,
    hasAttachments,
    unreadOnly: unreadOnly || undefined,
    sizeMin: sizeMin ? Number(sizeMin) : undefined,
    sizeMax: sizeMax ? Number(sizeMax) : undefined,
    label: labelFilter || undefined,
  };

  const { data: emailsData, isLoading: emailsLoading } = useListEmails(queryParams);

  const { data: selectedEmailData } = useQuery({
    queryKey: selectedEmailId ? getGetEmailQueryKey(selectedEmailId) : ["email", "not-selected"],

    queryFn: () => getEmail(selectedEmailId!),

    enabled: Boolean(selectedEmailId),
  });

  // NOVAMAIL_GMAIL_AUTO_SYNC_START
  useEffect(() => {
    let cancelled = false;
    let syncRunning = false;

    const runAutomaticGmailSync = async () => {
      if (cancelled || syncRunning || document.visibilityState !== "visible") {
        return;
      }

      syncRunning = true;

      try {
        const status = await getGmailStatus();

        const gmailReady = status.configured && status.connected && !status.migrationRequired;

        if (!gmailReady || cancelled) {
          return;
        }

        const result = await syncGmail();

        if (cancelled) {
          return;
        }

        // A sync can update existing Gmail messages without importing a new one.
        // Refresh the UI after every successful sync so label/read/star/folder
        // changes become visible immediately.
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: getListEmailsQueryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: getGetInboxStatsQueryKey(),
          }),
        ]);

        window.dispatchEvent(new Event("novamail:thread-updated"));
      } catch {
        // Background Gmail sync failure is intentionally not exposed in the browser console.
      } finally {
        syncRunning = false;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void runAutomaticGmailSync();
      }
    };

    void runAutomaticGmailSync();

    const intervalId = window.setInterval(() => {
      void runAutomaticGmailSync();
    }, 60_000);

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);

      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [queryClient]);
  // NOVAMAIL_GMAIL_AUTO_SYNC_END

  const handleCompose = () => {
    setComposeDefaults({});
    setIsComposeOpen(true);
  };

  const handleReply = (email: Email) => {
    setComposeDefaults({
      to: email.from.email,
      cc: "",
      bcc: "",

      subject: addSubjectPrefix(email.subject, "Re:"),

      body: createQuotedMessage(email, "Original message"),

      replyToId: email.id,
      inReplyTo: email.messageId || undefined,
      references: [...(email.references || []), ...(email.messageId ? [email.messageId] : [])],
    });

    setIsComposeOpen(true);
  };

  const handleReplyAll = (email: Email) => {
    const primaryRecipients = removeDuplicateRecipients(
      [email.from, ...(email.to || [])],
      user?.email,
    );
    const primarySet = new Set(primaryRecipients.map((recipient) => recipient.toLowerCase()));
    const ccRecipients = removeDuplicateRecipients(email.cc || [], user?.email).filter(
      (recipient) => !primarySet.has(recipient.toLowerCase()),
    );

    setComposeDefaults({
      to: primaryRecipients.join(", "),
      cc: ccRecipients.join(", "),
      bcc: "",

      subject: addSubjectPrefix(email.subject, "Re:"),

      body: createQuotedMessage(email, "Original message"),

      replyToId: email.id,
      inReplyTo: email.messageId || undefined,
      references: [...(email.references || []), ...(email.messageId ? [email.messageId] : [])],
    });

    setIsComposeOpen(true);
  };

  const handleForward = (email: Email) => {
    setComposeDefaults({
      to: "",
      cc: "",
      bcc: "",

      subject: addSubjectPrefix(email.subject, "Fwd:"),

      body: createQuotedMessage(email, "Forwarded message"),
      attachments: getComposeAttachments(email),
      replyToId: undefined,
      inReplyTo: undefined,
      references: email.references || [],
    });

    setIsComposeOpen(true);
  };

  const emails = emailsData?.emails || [];

  const handleEmailSelect = (id: string) => {
    if (folder === "drafts") {
      const draft = emails.find((email) => email.id === id);

      if (!draft) {
        return;
      }

      closeSelectedEmail();

      setComposeDefaults({
        draftId: draft.id,
        to: (draft.to || [])
          .map((recipient) => recipient.email)
          .filter(Boolean)
          .join(", "),
        cc: (draft.cc || [])
          .map((recipient) => recipient.email)
          .filter(Boolean)
          .join(", "),
        bcc: (draft.bcc || [])
          .map((recipient) => recipient.email)
          .filter(Boolean)
          .join(", "),
        subject: draft.subject || "",
        body: draft.bodyText || "",
        replyToId: draft.replyToId || undefined,
        inReplyTo: draft.inReplyTo || undefined,
        references: draft.references || [],
        attachments: getComposeAttachments(draft),
      });

      setIsComposeOpen(true);
      return;
    }

    openSelectedEmail(id);
  };

  React.useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = Boolean(
        target &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)),
      );
      if (isTyping || event.ctrlKey || event.metaKey || event.altKey) return;

      const key = event.key.toLowerCase();
      if (key === "c") {
        event.preventDefault();
        handleCompose();
        return;
      }
      if (key === "r" && selectedEmailData && !isComposeOpen) {
        event.preventDefault();
        handleReply(selectedEmailData);
        return;
      }
      if (key === "e" && selectedEmailId) {
        event.preventDefault();
        void moveEmailMutation
          .mutateAsync({ id: selectedEmailId, data: { folder: "archive", customFolderId: null } })
          .then(async () => {
            await queryClient.invalidateQueries({ queryKey: getListEmailsQueryKey() });
            closeSelectedEmail();
          })
          .catch(() => undefined);
        return;
      }
      if ((key === "j" || key === "k") && emails.length > 0) {
        event.preventDefault();
        const currentIndex = selectedEmailId
          ? emails.findIndex((email) => email.id === selectedEmailId)
          : -1;
        const nextIndex =
          key === "j"
            ? Math.min(emails.length - 1, currentIndex < 0 ? 0 : currentIndex + 1)
            : Math.max(0, currentIndex < 0 ? emails.length - 1 : currentIndex - 1);
        const nextEmail = emails[nextIndex];
        if (nextEmail) handleEmailSelect(nextEmail.id);
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [emails, selectedEmailData, selectedEmailId, isComposeOpen, moveEmailMutation, queryClient]);

  return (
    <div className="novamail-global-shell h-screen w-full flex flex-col overflow-hidden bg-background">
      <EmailVerificationBanner collapsible />
      <TwoFactorBanner email={user?.email} onEnable={() => setLocation("/settings")} collapsible />
      <div className="min-h-0 flex-1 flex overflow-hidden">
        {mobileSidebarOpen && (
          <div
            className="novamail-mobile-overlay fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}

        <div
          className={cn(
            "novamail-mobile-drawer fixed inset-y-0 left-0 rtl:left-auto rtl:right-0 z-50 w-[80vw] max-w-[360px] transform transition-transform duration-300 ease-in-out md:hidden flex",

            mobileSidebarOpen ? "translate-x-0" : "-translate-x-full rtl:translate-x-full",
          )}
        >
          <Sidebar
            currentFolder={folder}
            onCompose={() => {
              setMobileSidebarOpen(false);
              handleCompose();
            }}
            className="w-full"
          />
        </div>

        <ResizablePanelGroup direction="horizontal" className="h-full items-stretch">
          <ResizablePanel defaultSize={20} minSize={15} maxSize={20} className="hidden md:flex">
            <Sidebar currentFolder={folder} onCompose={handleCompose} />
          </ResizablePanel>

          <ResizableHandle className="hidden md:flex w-px bg-border" />

          <ResizablePanel
            defaultSize={35}
            minSize={30}
            maxSize={45}
            className={cn(
              "flex flex-col",

              selectedEmailId && "hidden md:flex",
            )}
          >
            <div className="novamail-mobile-header md:hidden flex items-center p-2 border-b">
              <Button variant="ghost" size="icon" onClick={() => setMobileSidebarOpen(true)}>
                <Menu className="h-5 w-5" />
              </Button>

              <div className="novamail-mobile-brand ms-2">
                <BrandMark compact />
                <small>{folderLabel}</small>
              </div>
            </div>

            <EmailList
              emails={emails}
              selectedEmailId={selectedEmailId}
              onSelectEmail={handleEmailSelect}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              dateFrom={dateFrom}
              setDateFrom={setDateFrom}
              dateTo={dateTo}
              setDateTo={setDateTo}
              hasAttachments={hasAttachments}
              setHasAttachments={setHasAttachments}
              unreadOnly={unreadOnly}
              setUnreadOnly={setUnreadOnly}
              sizeMin={sizeMin}
              setSizeMin={setSizeMin}
              sizeMax={sizeMax}
              setSizeMax={setSizeMax}
              labelFilter={labelFilter}
              setLabelFilter={setLabelFilter}
              isLoading={emailsLoading}
              currentFolder={folder}
            />
          </ResizablePanel>

          <ResizableHandle className="hidden md:flex w-px bg-border" />

          <ResizablePanel
            defaultSize={45}
            className={cn(
              "flex-col",

              !selectedEmailId ? "hidden md:flex" : "flex",
            )}
          >
            {selectedEmailId && (
              <div className="novamail-mobile-backbar novamail-reader-backbar md:hidden flex items-center p-2 border-b bg-card">
                <Button variant="ghost" size="sm" onClick={() => setSelectedEmailId(null)}>
                  {isRtlLocale(locale) ? "→" : "←"} {t("inbox.backToList")}
                </Button>
              </div>
            )}

            <EmailDetail
              email={selectedEmailData || null}
              onReply={handleReply}
              onReplyAll={handleReplyAll}
              onForward={handleForward}
              onClose={() => setSelectedEmailId(null)}
              currentFolder={folder}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* NOVAMAIL_MOBILE_NAV_V2 */}
      {!selectedEmailId && !mobileSidebarOpen && (
        <>
          <nav className="novamail-mobile-bottom-nav md:hidden" aria-label={t("inbox.mobileNavigation")}>
            <button
              type="button"
              className={cn("novamail-mobile-nav-item", folder === "inbox" && "is-active")}
              onClick={() => setLocation("/")}
              aria-current={folder === "inbox" ? "page" : undefined}
            >
              <InboxIcon className="h-5 w-5" />
              <span>{t("folder.inbox")}</span>
            </button>

            <button
              type="button"
              className={cn("novamail-mobile-nav-item", folder === "starred" && "is-active")}
              onClick={() => setLocation("/folder/starred")}
              aria-current={folder === "starred" ? "page" : undefined}
            >
              <Star className="h-5 w-5" />
              <span>{t("folder.starred")}</span>
            </button>

            <button
              type="button"
              className={cn("novamail-mobile-nav-item", folder === "sent" && "is-active")}
              onClick={() => setLocation("/folder/sent")}
              aria-current={folder === "sent" ? "page" : undefined}
            >
              <Send className="h-5 w-5" />
              <span>{t("folder.sent")}</span>
            </button>

            <button
              type="button"
              className="novamail-mobile-nav-item"
              onClick={() => setMobileSidebarOpen(true)}
            >
              <MoreHorizontal className="h-5 w-5" />
              <span>{t("inbox.more")}</span>
            </button>
          </nav>

          <Button
            type="button"
            onClick={handleCompose}
            className="novamail-mobile-compose md:hidden"
            aria-label={t("inbox.compose")}
          >
            <span className="text-xl leading-none">+</span>
            <span>{t("inbox.compose")}</span>
          </Button>
        </>
      )}

      <ComposeModal
        open={isComposeOpen}
        onOpenChange={setIsComposeOpen}
        draftId={composeDefaults.draftId}
        defaultTo={composeDefaults.to}
        defaultCc={composeDefaults.cc}
        defaultBcc={composeDefaults.bcc}
        defaultSubject={composeDefaults.subject}
        defaultBody={composeDefaults.body}
        defaultAttachments={composeDefaults.attachments}
        replyToId={composeDefaults.replyToId}
        inReplyTo={composeDefaults.inReplyTo}
        references={composeDefaults.references}
      />
    </div>
  );
}
