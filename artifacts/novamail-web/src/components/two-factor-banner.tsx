import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTwoFactorStatus } from "@/lib/auth-api";
import { useI18n } from "@/hooks/use-i18n";

export function TwoFactorBanner({
  email,
  onEnable,
}: {
  email?: string;
  onEnable: () => void;
}) {
  const { locale } = useI18n();

  const storageKey = `zephyx-2fa-banner-until:${email || "account"}`;

  const [hidden, setHidden] = useState(() => {
    try {
      return Number(localStorage.getItem(storageKey) || "0") > Date.now();
    } catch {
      return false;
    }
  });

  const status = useQuery({
    queryKey: ["two-factor-status"],
    queryFn: getTwoFactorStatus,
    retry: false,
  });

  if (hidden || status.isLoading || status.isError || status.data?.enabled) {
    return null;
  }

  const ar = locale === "ar";
  const fr = locale === "fr";

  const title = ar
    ? "أمّن حسابك"
    : fr
      ? "Sécurisez votre compte"
      : "Secure your account";

  const description = ar
    ? "فعّل التحقق بخطوتين (2FA) لإضافة حماية إضافية إلى حسابك."
    : fr
      ? "Activez la validation en deux étapes (2FA) pour mieux protéger votre compte."
      : "Enable two-factor authentication (2FA) for extra account protection.";

  const enableText = ar
    ? "تفعيل الآن"
    : fr
      ? "Activer maintenant"
      : "Enable now";

  const laterText = ar ? "لاحقًا" : fr ? "Plus tard" : "Later";

  const remindLater = () => {
    try {
      localStorage.setItem(
        storageKey,
        String(Date.now() + 7 * 24 * 60 * 60 * 1000),
      );
    } catch {}
    setHidden(true);
  };

  return (
    <div className="mx-3 mt-3 flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:mx-4">
      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15">
        <ShieldCheck className="h-5 w-5 text-primary" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="font-semibold">{title}</div>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">
          {description}
        </p>

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
        aria-label="Dismiss"
        onClick={remindLater}
        className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
