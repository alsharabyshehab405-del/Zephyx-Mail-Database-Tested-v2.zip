import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import * as z from "zod";
import { Link } from "wouter";
import { CheckCircle2, Inbox, KeyRound } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { resetPassword, getApiErrorMessage } from "@/lib/auth-api";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LanguageSwitcher } from "@/components/language-switcher";

const schema = z
  .object({
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export default function ResetPassword() {
  const { t } = useI18n();
  const { logout } = useAuth();
  const [completed, setCompleted] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const token = new URLSearchParams(window.location.search).get("token")?.trim() ?? "";

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const mutation = useMutation({
    mutationFn: (newPassword: string) => resetPassword(token, newPassword),
    onSuccess: () => {
      logout();
      setRequestError(null);
      setCompleted(true);
    },
    onError: (error) => {
      setRequestError(getApiErrorMessage(error, t("password.resetFailed")));
    },
  });

  return (
    <div className="novamail-auth-page novamail-auth-centered flex min-h-screen items-center justify-center bg-muted/30 px-4 py-12">
      <Card className="novamail-auth-recovery-card w-full max-w-md shadow-lg">
        <CardHeader className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2 text-primary">
              <Inbox className="h-7 w-7" />
              <span className="text-xl font-bold">Zephyx Mail</span>
            </div>
            <LanguageSwitcher className="shrink-0" />
          </div>
          <div>
            <CardTitle className="text-2xl">{t("password.resetTitle")}</CardTitle>
            <CardDescription className="mt-2">{t("password.resetDescription")}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {!token ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-destructive">{t("password.invalidLink")}</p>
              <Button asChild className="w-full">
                <Link href="/forgot-password">{t("password.requestNewLink")}</Link>
              </Button>
            </div>
          ) : completed ? (
            <div className="space-y-6 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
              <div className="space-y-2">
                <h2 className="font-semibold">{t("password.resetSuccessTitle")}</h2>
                <p className="text-sm text-muted-foreground">
                  {t("password.resetSuccessDescription")}
                </p>
              </div>
              <Button asChild className="w-full">
                <Link href="/login">{t("login.submit")}</Link>
              </Button>
            </div>
          ) : (
            <Form {...form}>
              <form
                className="space-y-5"
                onSubmit={form.handleSubmit((values) => mutation.mutate(values.newPassword))}
              >
                <FormField
                  control={form.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("settings.newPassword")}</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground rtl:left-auto rtl:right-3" />
                          <Input
                            type="password"
                            autoComplete="new-password"
                            className="pl-9 rtl:pl-3 rtl:pr-9"
                            disabled={mutation.isPending}
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("password.confirmPassword")}</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          autoComplete="new-password"
                          disabled={mutation.isPending}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {requestError && <p className="text-sm text-destructive">{requestError}</p>}

                <Button className="w-full" type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? t("common.loading") : t("password.resetSubmit")}
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
