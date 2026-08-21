import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { getApiErrorMessage, loginWithPassword, verifyTwoFactorLogin } from "@/lib/auth-api";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Inbox, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { LanguageSwitcher } from "@/components/language-switcher";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

const invalidCredentialsMessages = {
  en: "Email or password is incorrect",
  ar: "البريد الإلكتروني أو كلمة المرور غير صحيحة",
  fr: "Adresse e-mail ou mot de passe incorrect",
  es: "Correo electrónico o contraseña incorrectos",
  de: "E-Mail-Adresse oder Passwort ist falsch",
  pt: "E-mail ou senha incorretos",
  tr: "E-posta veya parola yanlış",
  zh: "电子邮箱或密码不正确",
  hi: "ईमेल या पासवर्ड गलत है",
  id: "Email atau kata sandi salah",
} as const;

export default function Login() {
  const { t, locale } = useI18n();
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const loginMutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => loginWithPassword(email, password),
  });

  const verifyMutation = useMutation({
    mutationFn: ({ challengeToken, code }: { challengeToken: string; code: string }) => verifyTwoFactorLogin(challengeToken, code),
  });

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = (values: z.infer<typeof loginSchema>) => {
    setLoginError(null);
    const credentials = {
      email: values.email.trim().toLowerCase(),
      password: values.password,
    };

    loginMutation.mutate(credentials, {
      onSuccess: (data) => {
        if (data.twoFactorRequired) {
          setChallengeToken(data.challengeToken);
          setTwoFactorCode("");
          form.setValue("password", "");
          return;
        }
        login({ accessToken: data.accessToken, refreshToken: data.refreshToken }, data.user);
        form.reset();
        setLocation("/", { replace: true });
      },
      onError: (error: unknown) => {
        form.setValue("password", "");
        setLoginError(invalidCredentialsMessages[locale] ?? invalidCredentialsMessages.en);
        toast({ title: t("common.error"), description: invalidCredentialsMessages[locale] ?? invalidCredentialsMessages.en, variant: "destructive" });
      },
    });
  };

  const onVerifyTwoFactor = () => {
    if (!challengeToken || twoFactorCode.trim().length < 6) return;
    verifyMutation.mutate({ challengeToken, code: twoFactorCode.trim() }, {
      onSuccess: (data) => {
        login({ accessToken: data.accessToken, refreshToken: data.refreshToken }, data.user);
        setChallengeToken(null);
        setTwoFactorCode("");
        form.reset();
        setLocation("/", { replace: true });
      },
      onError: (error: unknown) => {
        setTwoFactorCode("");
        toast({ title: t("common.error"), description: getApiErrorMessage(error, "Invalid verification code"), variant: "destructive" });
      },
    });
  };

  return (
    <div className="novamail-auth-page flex min-h-[100dvh] w-full overflow-x-clip">
      <div className="novamail-auth-panel flex-1 flex flex-col justify-center py-12 px-4 sm:px-6 lg:flex-none lg:px-20 xl:px-24">
        <div className="novamail-auth-card mx-auto w-full max-w-sm lg:w-96">
          <div className="mb-8 flex items-start justify-between gap-3">
            <div className="novamail-auth-brand-lockup flex min-w-0 items-center gap-3">
              <span className="novamail-auth-logo"><Inbox className="w-5 h-5" /></span>
              <div className="min-w-0">
                <span className="block text-xl font-bold tracking-tight text-foreground">{t("brand.name")}</span>
                <span className="block text-xs text-muted-foreground">{t("brand.tagline")}</span>
              </div>
            </div>
            <LanguageSwitcher className="shrink-0" />
          </div>

          {challengeToken ? (
            <div className="mt-6 space-y-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-3xl font-extrabold tracking-tight text-foreground">
                  {locale === "ar" ? "التحقق بخطوتين" : "Two-factor authentication"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {locale === "ar" ? "أدخل رمز الـ6 أرقام من تطبيق المصادقة، أو استخدم رمز استرداد." : "Enter the 6-digit code from your authenticator app, or use a recovery code."}
                </p>
              </div>
              <Input
                autoFocus
                autoComplete="one-time-code"
                value={twoFactorCode}
                onChange={(e) => setTwoFactorCode(e.target.value)}
                placeholder={locale === "ar" ? "رمز التحقق" : "Verification code"}
                maxLength={64}
                className="font-mono tracking-wider"
                disabled={verifyMutation.isPending}
              />
              <Button className="w-full" onClick={onVerifyTwoFactor} disabled={verifyMutation.isPending || twoFactorCode.trim().length < 6}>
                {verifyMutation.isPending ? t("common.loading") : (locale === "ar" ? "تحقق وسجّل الدخول" : "Verify and sign in")}
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => { setChallengeToken(null); setTwoFactorCode(""); }} disabled={verifyMutation.isPending}>
                {locale === "ar" ? "العودة إلى كلمة المرور" : "Back to password"}
              </Button>
            </div>
          ) : (
            <>
          <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-foreground">
            {t("login.title")}
          </h2>

          <p className="mt-2 text-sm text-muted-foreground">{t("login.subtitle")}</p>

          <div className="mt-8">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" autoComplete="off">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("login.email")}</FormLabel>

                      <FormControl>
                        <Input
                          type="email"
                        required
                          inputMode="email"
                          autoComplete="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          disabled={loginMutation.isPending}
                          {...field}
                        />
                      </FormControl>

                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("login.password")}</FormLabel>

                      <div className="relative">
<FormControl>
                        <Input
                        className="pe-12"
                          type={showPassword ? "text" : "password"}
                        required
                          autoComplete="current-password"
                          autoCapitalize="none"
                          spellCheck={false}
                          disabled={loginMutation.isPending}
                          {...field}
                        />
                      </FormControl>
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>

                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end">
                  <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
                    {t("login.forgotPassword")}
                  </Link>
                </div>

                {loginError && (
              <div
                role="alert"
                aria-live="assertive"
                data-testid="login-error"
                className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              >
                {loginError}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
                  {loginMutation.isPending ? t("common.loading") : t("login.submit")}
                </Button>
              </form>
            </Form>

            <div className="mt-6 text-sm text-center">
              <span className="text-muted-foreground mr-1">{t("login.noAccount")}</span>

              <Link href="/register" className="font-medium text-primary hover:underline">
                {t("login.registerLink")}
              </Link>
            </div>
          </div>
            </>
          )}
        </div>
      </div>

      <div className="novamail-auth-hero hidden lg:block relative w-0 flex-1 bg-muted">
        <div className="absolute inset-0 bg-primary/5 flex items-center justify-center">
          <div className="novamail-auth-hero-copy max-w-lg p-10">
            <span className="novamail-auth-hero-icon"><Inbox className="w-8 h-8" /></span>
            <p className="novamail-auth-eyebrow">{t("brand.name")}</p>
            <h2 className="text-4xl xl:text-5xl font-bold tracking-tight text-foreground mb-5">
              {t("brand.heroTitle")}
            </h2>
            <p className="text-muted-foreground text-lg leading-8">
              {t("brand.heroDescription")}
            </p>
            <div className="novamail-auth-features">
              <span>{t("brand.featureFast")}</span>
              <span>{t("brand.featurePrivate")}</span>
              <span>{t("brand.featureFocused")}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
