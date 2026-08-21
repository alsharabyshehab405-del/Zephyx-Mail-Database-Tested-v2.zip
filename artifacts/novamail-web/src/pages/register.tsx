import { useState } from "react";
import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { useToast } from "@/hooks/use-toast";
import { useRegister } from "@workspace/api-client-react";
import { getApiErrorMessage } from "@/lib/auth-api";
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
import { Inbox, Eye, EyeOff } from "lucide-react";
import { LanguageSwitcher } from "@/components/language-switcher";

const duplicateEmailMessages: Record<string, string> = {
  en: "An account with this email already exists. Sign in or use another email.",
  ar: "يوجد حساب مسجل بهذا البريد الإلكتروني بالفعل. سجّل الدخول أو استخدم بريدًا آخر.",
  fr: "Un compte avec cette adresse e-mail existe déjà. Connectez-vous ou utilisez une autre adresse.",
  es: "Ya existe una cuenta con este correo electrónico. Inicia sesión o usa otro correo.",
  de: "Für diese E-Mail-Adresse existiert bereits ein Konto. Melde dich an oder verwende eine andere Adresse.",
  pt: "Já existe uma conta com este e-mail. Entre na sua conta ou use outro e-mail.",
  tr: "Bu e-posta adresiyle zaten bir hesap var. Giriş yapın veya başka bir e-posta kullanın.",
  zh: "此电子邮件地址已注册账户。请登录或使用其他电子邮件地址。",
  hi: "इस ईमेल पते से पहले से एक खाता मौजूद है। साइन इन करें या दूसरा ईमेल इस्तेमाल करें।",
  id: "Akun dengan email ini sudah ada. Masuk atau gunakan email lain.",
};

const confirmPasswordLabels: Record<string, string> = {
  en: "Confirm password",
  ar: "تأكيد كلمة المرور",
  fr: "Confirmer le mot de passe",
  es: "Confirmar contraseña",
  de: "Passwort bestätigen",
  pt: "Confirmar senha",
  tr: "Şifreyi doğrula",
  zh: "确认密码",
  hi: "पासवर्ड की पुष्टि करें",
  id: "Konfirmasi kata sandi",
};

const passwordMismatchMessages: Record<string, string> = {
  en: "Passwords do not match",
  ar: "كلمتا المرور غير متطابقتين",
  fr: "Les mots de passe ne correspondent pas",
  es: "Las contraseñas no coinciden",
  de: "Die Passwörter stimmen nicht überein",
  pt: "As senhas não coincidem",
  tr: "Şifreler eşleşmiyor",
  zh: "两次输入的密码不一致",
  hi: "पासवर्ड मेल नहीं खाते",
  id: "Kata sandi tidak cocok",
};

const registerSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  email: z.string().trim().min(1, "Email address is required").email("Enter a valid email address"),
  password: z
    .string()
    .min(1, "Password is required")
    .min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Confirm password is required"),
});

export default function Register() {
  const { t, locale } = useI18n();
  const confirmPasswordLabel = confirmPasswordLabels[locale] ?? confirmPasswordLabels.en;
  const passwordMismatchMessage = passwordMismatchMessages[locale] ?? passwordMismatchMessages.en;
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();
  const registerMutation = useRegister();

  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = (values: z.infer<typeof registerSchema>) => {
    form.clearErrors("confirmPassword");

    if (values.password !== values.confirmPassword) {
      form.setError("confirmPassword", {
        type: "manual",
        message: passwordMismatchMessage,
      });
      return;
    }

    const registrationData = {
      firstName: values.firstName,
      lastName: values.lastName,
      email: values.email,
      password: values.password,
    };

    registerMutation.mutate(
      { data: registrationData },
      {
        onSuccess: (data) => {
          login({ accessToken: data.accessToken, refreshToken: data.refreshToken }, data.user);
          setLocation("/", { replace: true });
        },
        onError: (err: unknown) => {
          const apiMessage = getApiErrorMessage(err, "");
          const isDuplicateEmail = /already registered|already exists/i.test(apiMessage);

          toast({
            title: t("common.error"),
            description: isDuplicateEmail
              ? (duplicateEmailMessages[locale] ?? duplicateEmailMessages.en)
              : getApiErrorMessage(err, "Could not create account. Please try again."),
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <div className="novamail-auth-page flex min-h-[100dvh] w-full overflow-x-clip">
      <div className="novamail-auth-panel flex-1 flex flex-col justify-center py-12 px-4 sm:px-6 lg:flex-none lg:px-20 xl:px-24">
        <div className="novamail-auth-card mx-auto w-full max-w-sm lg:w-96">
          <div className="mb-8 flex items-start justify-between gap-3">
            <div className="novamail-auth-brand-lockup flex min-w-0 items-center gap-3">
              <span className="novamail-auth-logo">
                <Inbox className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <span className="block text-xl font-bold tracking-tight text-foreground">
                  {t("brand.name")}
                </span>
                <span className="block text-xs text-muted-foreground">{t("brand.tagline")}</span>
              </div>
            </div>
            <LanguageSwitcher className="shrink-0" />
          </div>

          <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-foreground">
            {t("register.title")}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("register.subtitle")}</p>

          <div className="mt-8">
            <Form {...form}>
              <form
                noValidate
                onSubmit={form.handleSubmit(onSubmit, () => {
                  const values = form.getValues();

                  if (!values.firstName?.trim()) {
                    form.setError("firstName", {
                      type: "manual",
                      message: locale === "ar" ? "الاسم الأول مطلوب" : "First name is required",
                    });
                  }

                  if (!values.lastName?.trim()) {
                    form.setError("lastName", {
                      type: "manual",
                      message: locale === "ar" ? "الاسم الأخير مطلوب" : "Last name is required",
                    });
                  }

                  if (!values.email?.trim()) {
                    form.setError("email", {
                      type: "manual",
                      message:
                        locale === "ar" ? "البريد الإلكتروني مطلوب" : "Email address is required",
                    });
                  }

                  if (!values.password) {
                    form.setError("password", {
                      type: "manual",
                      message: locale === "ar" ? "كلمة المرور مطلوبة" : "Password is required",
                    });
                  }

                  if (!values.confirmPassword) {
                    form.setError("confirmPassword", {
                      type: "manual",
                      message:
                        locale === "ar"
                          ? "تأكيد كلمة المرور مطلوب"
                          : "Confirm password is required",
                    });
                  }
                })}
                className="space-y-6"
              >
                <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("register.firstName")}</FormLabel>
                        <FormControl>
                          <Input disabled={registerMutation.isPending} {...field} />
                        </FormControl>
                        {form.formState.errors.firstName?.message && (
                          <p role="alert" className="text-sm font-medium text-destructive mt-1">
                            {String(form.formState.errors.firstName.message)}
                          </p>
                        )}
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("register.lastName")}</FormLabel>
                        <FormControl>
                          <Input disabled={registerMutation.isPending} {...field} />
                        </FormControl>
                        {form.formState.errors.lastName?.message && (
                          <p role="alert" className="text-sm font-medium text-destructive mt-1">
                            {String(form.formState.errors.lastName.message)}
                          </p>
                        )}
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("register.email")}</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          autoComplete="email"
                          disabled={registerMutation.isPending}
                          {...field}
                        />
                      </FormControl>
                      {form.formState.errors.email?.message && (
                        <p role="alert" className="text-sm font-medium text-destructive mt-1">
                          {String(form.formState.errors.email.message)}
                        </p>
                      )}
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("register.password")}</FormLabel>
                      <div className="relative">
                        <FormControl>
                          <Input
                            type={showPassword ? "text" : "password"}
                            required
                            minLength={8}
                            autoComplete="new-password"
                            disabled={registerMutation.isPending}
                            className="pe-12"
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
                      {form.formState.errors.password?.message && (
                        <p role="alert" className="text-sm font-medium text-destructive mt-1">
                          {String(form.formState.errors.password.message)}
                        </p>
                      )}
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{confirmPasswordLabel}</FormLabel>
                      <div className="relative">
                        <FormControl>
                          <Input
                            type={showConfirmPassword ? "text" : "password"}
                            required
                            minLength={8}
                            autoComplete="new-password"
                            disabled={registerMutation.isPending}
                            className="pe-12"
                            {...field}
                          />
                        </FormControl>

                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword((value) => !value)}
                          className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          aria-label={
                            showConfirmPassword ? "Hide confirm password" : "Show confirm password"
                          }
                        >
                          {showConfirmPassword ? (
                            <EyeOff className="h-5 w-5" />
                          ) : (
                            <Eye className="h-5 w-5" />
                          )}
                        </button>
                      </div>
                      {form.formState.errors.confirmPassword?.message && (
                        <p role="alert" className="text-sm font-medium text-destructive mt-1">
                          {String(form.formState.errors.confirmPassword.message)}
                        </p>
                      )}
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
                  {registerMutation.isPending ? t("common.loading") : t("register.submit")}
                </Button>
              </form>
            </Form>

            <nav
              className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground"
              aria-label="Legal"
            >
              <Link href="/privacy" className="hover:text-foreground hover:underline">
                {t("home.privacy")}
              </Link>
              <span aria-hidden="true">•</span>
              <Link href="/terms" className="hover:text-foreground hover:underline">
                {t("home.terms")}
              </Link>
            </nav>

            <div className="mt-6 text-sm text-center">
              <span className="text-muted-foreground mr-1">{t("register.hasAccount")}</span>
              <Link href="/login" className="font-medium text-primary hover:underline">
                {t("register.loginLink")}
              </Link>
            </div>
          </div>
        </div>
      </div>
      <div className="novamail-auth-hero hidden lg:block relative w-0 flex-1 bg-muted">
        <div className="absolute inset-0 bg-primary/5 flex items-center justify-center">
          <div className="novamail-auth-hero-copy max-w-lg p-10">
            <span className="novamail-auth-hero-icon">
              <Inbox className="w-8 h-8" />
            </span>
            <p className="novamail-auth-eyebrow">{t("brand.name")}</p>
            <h2 className="text-4xl xl:text-5xl font-bold tracking-tight text-foreground mb-5">
              {t("brand.registerHeroTitle")}
            </h2>
            <p className="text-muted-foreground text-lg leading-8">
              {t("brand.registerHeroDescription")}
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
