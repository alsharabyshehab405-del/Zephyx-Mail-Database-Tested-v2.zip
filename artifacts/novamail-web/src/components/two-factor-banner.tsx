import { useState } from "react";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTwoFactorStatus } from "@/lib/auth-api";
import { useI18n } from "@/hooks/use-i18n";
import { useIsMobile } from "@/hooks/use-mobile";

export function TwoFactorBanner({
  email,
  onEnable,
  collapsible = false,
}: {
  email?: string;
  onEnable: () => void;
  collapsible?: boolean;
}) {
  const { t } = useI18n();
  const isMobile = useIsMobile();

  const storageKey = `zephyx-2fa-banner-until:${email || "account"}`;
  const collapseStorageKey = `zephyx-2fa-banner-collapsed:${email || "account"}`;

  const [collapsed, setCollapsed] = useState(() => {
    if (!collapsible || typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(collapseStorageKey) === "true";
    } catch {
      return false;
    }
  });

  const [hidden, setHidden] = useState(() => {
    try {
      return Number(localStorage.getItem(storageKey) || "0") > Date.now();
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!collapsible || !isMobile || typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem(collapseStorageKey) === null) {
        setCollapsed(true);
        window.localStorage.setItem(collapseStorageKey, "true");
      }
    } catch {
      // A mobile-first default is still useful when storage is unavailable.
      setCollapsed(true);
    }
  }, [collapseStorageKey, collapsible, isMobile]);

  const status = useQuery({
    queryKey: ["two-factor-status"],
    queryFn: getTwoFactorStatus,
    retry: false,
  });

  if (hidden || status.isLoading || status.isError || status.data?.enabled) {
    return null;
  }

  const title = t("security.bannerTitle");
  const description = t("security.bannerDescription");
  const enableText = t("security.enableNow");
  const laterText = t("security.later");

  const handleToggle = (event: React.SyntheticEvent<HTMLDetailsElement>) => {
    if (!collapsible) return;
    setCollapsed(!event.currentTarget.open);
  };

  const handleSummaryClick = (event: React.MouseEvent<HTMLElement>) => {
    if (!collapsible) return;
    const details = event.currentTarget.parentElement as HTMLDetailsElement | null;
    if (!details) return;
    window.setTimeout(() => {
      const nextCollapsed = !details.open;
      setCollapsed(nextCollapsed);
      try {
        window.localStorage.setItem(collapseStorageKey, String(nextCollapsed));
      } catch {
        // Local persistence is best effort; security controls remain available in-session.
      }
    }, 0);
  };

  const remindLater = () => {
    try {
      localStorage.setItem(storageKey, String(Date.now() + 7 * 24 * 60 * 60 * 1000));
    } catch {}
    setHidden(true);
  };

  const content = (
    <div className="mx-3 mt-3 flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:mx-4">
      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15">
        <ShieldCheck className="h-5 w-5 text-primary" />
      </div>

      <div className="min-w-0 flex-1">
        {!collapsible ? <div className="font-semibold">{title}</div> : null}
        <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={onEnable}>
            {enableText}
          </Button>

          <Button size="sm" variant="ghost" onClick={remindLater}>
            {laterText}
          </Button>
        </div>
      </div>

      <button
        type="button"
        aria-label={t("security.dismiss")}
        onClick={remindLater}
        className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );

  return collapsible ? (
    <details
      className="novamail-inbox-verification-collapsible"
      open={!collapsed}
      onToggle={handleToggle}
      data-collapsed={collapsed ? "true" : "false"}
    >
      <summary onClick={handleSummaryClick} className="mx-3 mt-3 cursor-pointer rounded-xl border border-primary/20 bg-primary/5 px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:mx-4">
        {title}
      </summary>
      {content}
    </details>
  ) : (
    content
  );
}
