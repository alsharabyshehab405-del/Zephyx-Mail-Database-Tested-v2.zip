import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { CheckCircle2, Inbox, Loader2, MailCheck, XCircle } from "lucide-react";
import { getMe } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { confirmEmailVerification, getApiErrorMessage } from "@/lib/auth-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LanguageSwitcher } from "@/components/language-switcher";

type VerifyState = "loading" | "success" | "error";

export default function VerifyEmail() {
  const { t } = useI18n();
  const { isAuthenticated, updateUser } = useAuth();
  const token = new URLSearchParams(window.location.search).get("token")?.trim() ?? "";
  const started = useRef(false);
  const [status, setStatus] = useState<VerifyState>(token ? "loading" : "error");
  const [errorMessage, setErrorMessage] = useState(
    token ? "" : t("verification.invalidLink"),
  );

  const mutation = useMutation({
    mutationFn: () => confirmEmailVerification(token),
    onSuccess: async () => {
      if (isAuthenticated) {
        try {
          updateUser(await getMe());
        } catch {
          // Verification succeeded even when refreshing the local profile fails.
        }
      }
      setStatus("success");
    },
    onError: (error) => {
      setErrorMessage(getApiErrorMessage(error, t("verification.confirmFailed")));
      setStatus("error");
    },
  });

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    mutation.mutate();
  }, [token, mutation]);

  return (
    <div className="novamail-auth-page novamail-auth-centered flex min-h-screen items-center justify-center bg-muted/30 px-4 py-12">
      <Card className="novamail-auth-recovery-card w-full max-w-md text-center shadow-lg">
        <CardHeader className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2 text-primary">
              <Inbox className="h-7 w-7" />
              <span className="text-xl font-bold">Zephyx Mail</span>
            </div>
            <LanguageSwitcher className="shrink-0" />
          </div>
          <div>
            <CardTitle className="text-2xl">{t("verification.pageTitle")}</CardTitle>
            <CardDescription className="mt-2">{t("verification.pageDescription")}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {status === "loading" && (
            <div className="space-y-3">
              <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">{t("verification.confirming")}</p>
            </div>
          )}

          {status === "success" && (
            <div className="space-y-4">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
              <div>
                <h2 className="font-semibold">{t("verification.successTitle")}</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("verification.successDescription")}
                </p>
              </div>
              <Button asChild className="w-full">
                <Link href={isAuthenticated ? "/" : "/login"}>
                  {isAuthenticated ? t("verification.openInbox") : t("login.submit")}
                </Link>
              </Button>
            </div>
          )}

          {status === "error" && (
            <div className="space-y-4">
              <XCircle className="mx-auto h-12 w-12 text-destructive" />
              <div>
                <h2 className="font-semibold">{t("verification.errorTitle")}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{errorMessage}</p>
              </div>
              <Button asChild variant="outline" className="w-full">
                <Link href={isAuthenticated ? "/settings" : "/login"}>
                  <MailCheck className="mr-2 h-4 w-4 rtl:ml-2 rtl:mr-0" />
                  {isAuthenticated ? t("settings.title") : t("password.backToLogin")}
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
