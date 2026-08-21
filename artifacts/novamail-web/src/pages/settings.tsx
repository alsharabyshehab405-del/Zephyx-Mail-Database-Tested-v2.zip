import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as z from "zod";
import { Link, useLocation } from "wouter";
import {
  ArrowLeft,
  CheckCircle2,
  Cloud,
  Clock3,
  Link2,
  LogOut,
  MailCheck,
  MonitorSmartphone,
  Palette,
  RefreshCw,
  Shield,
  Unplug,
  User as UserIcon,
} from "lucide-react";
import {
  getGetInboxStatsQueryKey,
  getListEmailsQueryKey,
  useChangePassword,
  useUpdateMe,
} from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { translateForLocale, useI18n } from "@/hooks/use-i18n";
import { getIntlLocale, LOCALE_OPTIONS, LOCALES, type Locale } from "@/lib/i18n-config";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/components/theme-provider";
import { TwoFactorSettings } from "@/components/two-factor-settings";
import {
  getApiErrorMessage,
  listSessions,
  requestEmailVerification,
  revokeAllSessions,
  revokeSession,
  type AuthSession,
} from "@/lib/auth-api";
import {
  createGmailConnectUrl,
  disconnectGmail,
  getGmailStatus,
  syncGmail,
} from "@/lib/gmail-api";
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
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const profileSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  displayName: z.string().optional(),
});

const appearanceSchema = z.object({
  theme: z.enum(["light", "dark", "system"]),
  locale: z.enum(LOCALES),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });


function formatDeviceName(
  name: string | null | undefined,
  translate: (key: string) => string,
  fallback: string,
): string {
  if (!name) return fallback;

  const deviceKeys: Record<string, string> = {
    "Android Device": "sessions.deviceAndroid",
    "Windows Device": "sessions.deviceWindows",
    "Linux Device": "sessions.deviceLinux",
    "Mac Device": "sessions.deviceMac",
    iPhone: "sessions.deviceIPhone",
    iPad: "sessions.deviceIPad",
  };

  const key = deviceKeys[name];
  return key ? translate(key) : name;
}

function formatSessionDate(value: string | null, locale: Locale): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(getIntlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function SessionRow({
  session,
  locale,
  isPending,
  onRevoke,
}: {
  session: AuthSession;
  locale: Locale;
  isPending: boolean;
  onRevoke: (session: AuthSession) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="novamail-session-row flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <div className="rounded-full bg-primary/10 p-2 text-primary">
          <MonitorSmartphone className="h-5 w-5" />
        </div>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{formatDeviceName(session.deviceName, t, t("sessions.unknownDevice"))}</p>
            {session.isCurrent && <Badge variant="secondary">{t("sessions.current")}</Badge>}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {session.userAgentShort || t("sessions.noDeviceDetails")}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3.5 w-3.5" />
              {t("sessions.lastUsed")}: {formatSessionDate(session.lastUsedAt, locale)}
            </span>
            <span>
              {t("sessions.created")}: {formatSessionDate(session.createdAt, locale)}
            </span>
          </div>
        </div>
      </div>
      <Button
        variant={session.isCurrent ? "outline" : "destructive"}
        size="sm"
        disabled={isPending}
        onClick={() => onRevoke(session)}
      >
        <LogOut className="mr-2 h-4 w-4 rtl:ml-2 rtl:mr-0" />
        {session.isCurrent ? t("sessions.logoutThisDevice") : t("sessions.revoke")}
      </Button>
    </div>
  );
}

export default function Settings() {
  const { t, locale, setLocale } = useI18n();
  const { user, updateUser, logout } = useAuth();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const updateMeMutation = useUpdateMe();
  const changePasswordMutation = useChangePassword();

  const sessionsQuery = useQuery({
    queryKey: ["auth-sessions"],
    queryFn: listSessions,
  });

  const gmailStatusQuery = useQuery({
    queryKey: ["gmail-status"],
    queryFn: getGmailStatus,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gmailResult = params.get("gmail");
    const reason = params.get("reason");

    if (!gmailResult) return;

    if (gmailResult === "connected") {
      toast({
        title: t("gmail.connectedTitle"),
        description: t("gmail.connectedDescription"),
      });
      void queryClient.invalidateQueries({ queryKey: ["gmail-status"] });
    } else {
      const reasonKey = reason ? `gmail.error.${reason}` : "gmail.connectionFailed";
      toast({
        title: t("common.error"),
        description: t(reasonKey) === reasonKey ? t("gmail.connectionFailed") : t(reasonKey),
        variant: "destructive",
      });
    }

    params.delete("gmail");
    params.delete("reason");
    const query = params.toString();
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
    );
  }, [queryClient, t, toast]);

  const gmailConnectMutation = useMutation({
    mutationFn: createGmailConnectUrl,
    onSuccess: ({ url }) => {
      window.location.assign(url);
    },
    onError: (error) => {
      toast({
        title: t("common.error"),
        description: getApiErrorMessage(error, t("gmail.connectionFailed")),
        variant: "destructive",
      });
    },
  });

  const gmailSyncMutation = useMutation({
    mutationFn: syncGmail,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["gmail-status"] });
      void queryClient.invalidateQueries({ queryKey: getListEmailsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetInboxStatsQueryKey() });
      toast({
        title: t("gmail.syncSuccessTitle"),
        description: t("gmail.syncSuccessDescription", {
          count: String(result.imported),
        }),
      });
    },
    onError: (error) => {
      toast({
        title: t("common.error"),
        description: getApiErrorMessage(error, t("gmail.syncFailed")),
        variant: "destructive",
      });
    },
  });

  const gmailDisconnectMutation = useMutation({
    mutationFn: disconnectGmail,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["gmail-status"] });
      toast({ title: t("gmail.disconnectedTitle") });
    },
    onError: (error) => {
      toast({
        title: t("common.error"),
        description: getApiErrorMessage(error, t("gmail.disconnectFailed")),
        variant: "destructive",
      });
    },
  });

  const verificationMutation = useMutation({
    mutationFn: requestEmailVerification,
    onSuccess: () => {
      toast({
        title: t("verification.sentTitle"),
        description: t("verification.sentDescription"),
      });
    },
    onError: (error) => {
      toast({
        title: t("common.error"),
        description: getApiErrorMessage(error, t("verification.requestFailed")),
        variant: "destructive",
      });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (session: AuthSession) => revokeSession(session.id).then(() => session),
    onSuccess: (session) => {
      if (session.isCurrent) {
        logout();
        setLocation("/login");
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ["auth-sessions"] });
      toast({ title: t("sessions.revokedSuccess") });
    },
    onError: (error) => {
      toast({
        title: t("common.error"),
        description: getApiErrorMessage(error, t("sessions.revokeFailed")),
        variant: "destructive",
      });
    },
  });

  const revokeAllMutation = useMutation({
    mutationFn: (keepCurrentSession: boolean) => revokeAllSessions(keepCurrentSession),
    onSuccess: (_result, keepCurrentSession) => {
      if (!keepCurrentSession) {
        logout();
        setLocation("/login");
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ["auth-sessions"] });
      toast({ title: t("sessions.otherSessionsRevoked") });
    },
    onError: (error) => {
      toast({
        title: t("common.error"),
        description: getApiErrorMessage(error, t("sessions.revokeFailed")),
        variant: "destructive",
      });
    },
  });

  const sessions = sessionsQuery.data?.sessions ?? [];
  const otherSessionCount = useMemo(
    () => sessions.filter((session) => !session.isCurrent).length,
    [sessions],
  );

  const profileForm = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
      displayName: user?.displayName || "",
    },
  });

  const appearanceForm = useForm<z.infer<typeof appearanceSchema>>({
    resolver: zodResolver(appearanceSchema),
    defaultValues: {
      theme: user?.theme || theme || "system",
      locale,
    },
  });

  const passwordForm = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const onProfileSubmit = (values: z.infer<typeof profileSchema>) => {
    updateMeMutation.mutate(
      { data: values },
      {
        onSuccess: (updatedUser) => {
          updateUser(updatedUser);
          toast({ title: t("settings.profileSaved") });
        },
        onError: (error) => {
          toast({
            title: t("common.error"),
            description: getApiErrorMessage(error, t("settings.saveFailed")),
            variant: "destructive",
          });
        },
      },
    );
  };

  const onAppearanceSubmit = (values: z.infer<typeof appearanceSchema>) => {
    updateMeMutation.mutate(
      { data: { theme: values.theme, locale: values.locale } },
      {
        onSuccess: (updatedUser) => {
          updateUser(updatedUser);
          setTheme(values.theme);
          setLocale(values.locale, { syncAccount: false });
          toast({
            title: translateForLocale(values.locale, "settings.appearanceSaved"),
          });
        },
        onError: (error) => {
          toast({
            title: t("common.error"),
            description: getApiErrorMessage(error, t("settings.saveFailed")),
            variant: "destructive",
          });
        },
      },
    );
  };

  const onPasswordSubmit = (values: z.infer<typeof passwordSchema>) => {
    changePasswordMutation.mutate(
      {
        data: {
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        },
      },
      {
        onSuccess: () => {
          passwordForm.reset();
          void queryClient.invalidateQueries({ queryKey: ["auth-sessions"] });
          toast({ title: t("settings.passwordChanged") });
        },
        onError: (error) => {
          toast({
            title: t("common.error"),
            description: getApiErrorMessage(error, t("settings.passwordChangeFailed")),
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <div className="novamail-settings-page min-h-screen bg-background pb-28 md:pb-12">
      <header className="novamail-settings-header sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center px-4 sm:px-6">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/" aria-label={t("settings.backToInbox")}>
              <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
            </Link>
          </Button>
          <h1 className="ml-3 text-xl font-semibold rtl:ml-0 rtl:mr-3">{t("settings.title")}</h1>
        </div>
      </header>

      <main className="novamail-settings-main mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
        <Card className="novamail-settings-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <UserIcon className="h-5 w-5 text-primary" />
              <CardTitle>{t("settings.profile")}</CardTitle>
            </div>
            <CardDescription>{t("settings.profileDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...profileForm}>
              <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="max-w-2xl space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={profileForm.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("settings.firstName")}</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={profileForm.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("settings.lastName")}</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={profileForm.control}
                  name="displayName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("settings.displayName")}</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={updateMeMutation.isPending}>
                  {updateMeMutation.isPending ? t("common.loading") : t("settings.updateProfile")}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card className="novamail-settings-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Palette className="h-5 w-5 text-primary" />
              <CardTitle>{t("settings.appearance")}</CardTitle>
            </div>
            <CardDescription>{t("settings.appearanceDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...appearanceForm}>
              <form onSubmit={appearanceForm.handleSubmit(onAppearanceSubmit)} className="max-w-2xl space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={appearanceForm.control}
                    name="theme"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("settings.theme")}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="light">{t("settings.theme.light")}</SelectItem>
                            <SelectItem value="dark">{t("settings.theme.dark")}</SelectItem>
                            <SelectItem value="system">{t("settings.theme.system")}</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={appearanceForm.control}
                    name="locale"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("settings.language")}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            {LOCALE_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <Button type="submit" disabled={updateMeMutation.isPending}>
                  {updateMeMutation.isPending ? t("common.loading") : t("common.save")}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card className="novamail-settings-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <MailCheck className="h-5 w-5 text-primary" />
              <CardTitle>{t("verification.settingsTitle")}</CardTitle>
            </div>
            <CardDescription>{t("verification.settingsDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                {user?.emailVerifiedAt ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-500" />
                ) : (
                  <MailCheck className="mt-0.5 h-5 w-5 text-amber-500" />
                )}
                <div>
                  <p className="font-medium">
                    {user?.emailVerifiedAt
                      ? t("verification.verified")
                      : t("verification.notVerified")}
                  </p>
                  <p className="text-sm text-muted-foreground">{user?.email}</p>
                </div>
              </div>
              {!user?.emailVerifiedAt && (
                <Button
                  variant="outline"
                  disabled={verificationMutation.isPending}
                  onClick={() => verificationMutation.mutate()}
                >
                  <RefreshCw className="mr-2 h-4 w-4 rtl:ml-2 rtl:mr-0" />
                  {verificationMutation.isPending
                    ? t("common.loading")
                    : t("verification.resend")}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="novamail-settings-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Cloud className="h-5 w-5 text-primary" />
              <CardTitle>{t("gmail.title")}</CardTitle>
            </div>
            <CardDescription>{t("gmail.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            {gmailStatusQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : gmailStatusQuery.isError ? (
              <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-destructive">{t("gmail.statusFailed")}</p>
                <Button variant="outline" size="sm" onClick={() => gmailStatusQuery.refetch()}>
                  {t("common.retry")}
                </Button>
              </div>
            ) : gmailStatusQuery.data?.migrationRequired ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                <p className="font-medium">{t("gmail.migrationRequiredTitle")}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("gmail.migrationRequiredDescription")}
                </p>
              </div>
            ) : !gmailStatusQuery.data?.configured ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                <p className="font-medium">{t("gmail.notConfiguredTitle")}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("gmail.notConfiguredDescription")}
                </p>
              </div>
            ) : gmailStatusQuery.data.connected ? (
              <div className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{t("gmail.connected")}</p>
                      <Badge variant="secondary">{t("gmail.readOnly")}</Badge>
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {gmailStatusQuery.data.email}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("gmail.lastSync")}: {formatSessionDate(gmailStatusQuery.data.lastSyncedAt, locale)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    variant="outline"
                    disabled={gmailSyncMutation.isPending || gmailDisconnectMutation.isPending}
                    onClick={() => gmailSyncMutation.mutate()}
                  >
                    <RefreshCw className="mr-2 h-4 w-4 rtl:ml-2 rtl:mr-0" />
                    {gmailSyncMutation.isPending ? t("gmail.syncing") : t("gmail.syncNow")}
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={gmailDisconnectMutation.isPending || gmailSyncMutation.isPending}
                    onClick={() => gmailDisconnectMutation.mutate()}
                  >
                    <Unplug className="mr-2 h-4 w-4 rtl:ml-2 rtl:mr-0" />
                    {t("gmail.disconnect")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{t("gmail.notConnected")}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("gmail.connectDescription")}
                  </p>
                </div>
                <Button
                  disabled={gmailConnectMutation.isPending}
                  onClick={() => gmailConnectMutation.mutate()}
                >
                  <Link2 className="mr-2 h-4 w-4 rtl:ml-2 rtl:mr-0" />
                  {gmailConnectMutation.isPending ? t("common.loading") : t("gmail.connect")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="novamail-settings-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <CardTitle>{t("settings.security")}</CardTitle>
            </div>
            <CardDescription>{t("settings.securityDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...passwordForm}>
              <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="max-w-md space-y-4">
                <FormField
                  control={passwordForm.control}
                  name="currentPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("settings.currentPassword")}</FormLabel>
                      <FormControl><Input type="password" autoComplete="current-password" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={passwordForm.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("settings.newPassword")}</FormLabel>
                      <FormControl><Input type="password" autoComplete="new-password" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={passwordForm.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("password.confirmPassword")}</FormLabel>
                      <FormControl><Input type="password" autoComplete="new-password" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={changePasswordMutation.isPending}>
                  {changePasswordMutation.isPending
                    ? t("common.loading")
                    : t("settings.changePassword")}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <TwoFactorSettings />

        <Card className="novamail-settings-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <MonitorSmartphone className="h-5 w-5 text-primary" />
              <CardTitle>{t("sessions.title")}</CardTitle>
            </div>
            <CardDescription>{t("sessions.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {sessionsQuery.isLoading && (
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            )}
            {sessionsQuery.isError && (
              <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-destructive">{t("sessions.loadFailed")}</p>
                <Button variant="outline" size="sm" onClick={() => sessionsQuery.refetch()}>
                  {t("common.retry")}
                </Button>
              </div>
            )}
            {!sessionsQuery.isLoading && !sessionsQuery.isError && sessions.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("sessions.none")}</p>
            )}
            <div className="space-y-3">
              {sessions.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  locale={locale}
                  isPending={revokeMutation.isPending}
                  onRevoke={(selected) => revokeMutation.mutate(selected)}
                />
              ))}
            </div>

            <Separator />

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                disabled={otherSessionCount === 0 || revokeAllMutation.isPending}
                onClick={() => revokeAllMutation.mutate(true)}
              >
                {t("sessions.logoutOtherDevices")}
              </Button>
              <Button
                variant="destructive"
                disabled={sessions.length === 0 || revokeAllMutation.isPending}
                onClick={() => revokeAllMutation.mutate(false)}
              >
                <LogOut className="mr-2 h-4 w-4 rtl:ml-2 rtl:mr-0" />
                {t("sessions.logoutAllDevices")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
