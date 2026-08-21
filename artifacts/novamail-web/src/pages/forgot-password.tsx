import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import * as z from "zod";
import { Link } from "wouter";
import { ArrowLeft, CheckCircle2, Inbox, Mail } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { requestPasswordReset, getApiErrorMessage } from "@/lib/auth-api";
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

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
});

export default function ForgotPassword() {
  const { t } = useI18n();
  const [submitted, setSubmitted] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  const mutation = useMutation({
    mutationFn: (email: string) => requestPasswordReset(email.trim().toLowerCase()),
    onSuccess: () => {
      setRequestError(null);
      setSubmitted(true);
    },
    onError: (error) => {
      setRequestError(getApiErrorMessage(error, t("password.forgotFailed")));
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
            <CardTitle className="text-2xl">{t("password.forgotTitle")}</CardTitle>
            <CardDescription className="mt-2">{t("password.forgotDescription")}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <div className="space-y-6 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
              <div className="space-y-2">
                <h2 className="font-semibold">{t("password.checkEmailTitle")}</h2>
                <p className="text-sm text-muted-foreground">
                  {t("password.checkEmailDescription")}
                </p>
              </div>
              <Button variant="outline" className="w-full" onClick={() => setSubmitted(false)}>
                {t("password.tryAnotherEmail")}
              </Button>
              <Button asChild className="w-full">
                <Link href="/login">{t("password.backToLogin")}</Link>
              </Button>
            </div>
          ) : (
            <Form {...form}>
              <form
                className="space-y-5"
                onSubmit={form.handleSubmit((values) => mutation.mutate(values.email))}
              >
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("login.email")}</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground rtl:left-auto rtl:right-3" />
                          <Input
                            type="email"
                            inputMode="email"
                            autoComplete="email"
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

                {requestError && <p className="text-sm text-destructive">{requestError}</p>}

                <Button className="w-full" type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? t("common.loading") : t("password.sendResetLink")}
                </Button>

                <Button variant="ghost" className="w-full" asChild>
                  <Link href="/login">
                    <ArrowLeft className="mr-2 h-4 w-4 rtl:ml-2 rtl:mr-0 rtl:rotate-180" />
                    {t("password.backToLogin")}
                  </Link>
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
