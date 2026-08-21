import { Link } from "wouter";
import { Inbox, ShieldCheck, Zap, Mail, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/hooks/use-i18n";

export default function Home() {
  const { t } = useI18n();

  return (
    <div className="novamail-public-page min-h-[100dvh] overflow-x-clip bg-background text-foreground">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-6xl min-w-0 flex-col items-stretch gap-3 px-4 py-4 min-[480px]:flex-row min-[480px]:items-center min-[480px]:justify-between sm:px-5 sm:py-5">
          <div className="flex w-full min-w-0 items-center gap-3 min-[480px]:w-auto min-[480px]:flex-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Inbox className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="whitespace-nowrap font-bold">Zephyx Mail</div>
              <div className="hidden truncate text-xs text-muted-foreground min-[420px]:block">
                {t("brand.tagline")}
              </div>
            </div>
          </div>

          <div className="flex w-full min-w-0 items-center justify-between gap-2 min-[480px]:w-auto min-[480px]:shrink-0 min-[480px]:justify-start">
            <LanguageSwitcher />
            <Link href="/login">
              <Button variant="ghost">{t("login.submit")}</Button>
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 py-14 text-center sm:px-5 sm:py-28">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-sm text-primary">
            <ShieldCheck className="h-4 w-4" />
            {t("brand.featurePrivate")}
          </div>

          <h1 className="mx-auto max-w-4xl text-[clamp(2.15rem,10vw,3.75rem)] font-extrabold leading-[1.04] tracking-tight">
            {t("brand.heroTitle")}
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
            {t("brand.heroDescription")}
          </p>

          <div className="mx-auto mt-8 flex max-w-md flex-col justify-center gap-3 min-[420px]:flex-row">
            <Link href="/register" className="w-full min-[420px]:w-auto">
              <Button size="lg" className="w-full gap-2 min-[420px]:w-auto">
                {t("register.submit")}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>

            <Link href="/login" className="w-full min-[420px]:w-auto">
              <Button size="lg" variant="outline" className="w-full min-[420px]:w-auto">
                {t("login.submit")}
              </Button>
            </Link>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-14 sm:px-5 sm:pb-20 md:grid-cols-3">
          <Feature
            icon={<Mail className="h-5 w-5" />}
            title={t("brand.featureFocused")}
            text={t("home.featureInboxDescription")}
          />

          <Feature
            icon={<Zap className="h-5 w-5" />}
            title={t("brand.featureFast")}
            text={t("home.featureWorkflowDescription")}
          />

          <Feature
            icon={<ShieldCheck className="h-5 w-5" />}
            title={t("brand.featurePrivate")}
            text={t("home.featureSecurityDescription")}
          />
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 Zephyx Mail</span>

          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/privacy">{t("home.privacy")}</Link>
            <Link href="/terms">{t("home.terms")}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Feature({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-6">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </div>
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
    </div>
  );
}
