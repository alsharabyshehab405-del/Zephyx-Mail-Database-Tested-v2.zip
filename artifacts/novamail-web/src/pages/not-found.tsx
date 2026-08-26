import { Link } from "wouter";
import { Inbox, ArrowLeft } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const { t } = useI18n();

  return (
    <div className="novamail-auth-page novamail-auth-centered min-h-screen px-4 py-12">
      <div className="novamail-not-found-card w-full max-w-lg text-center">
        <span className="novamail-auth-logo mx-auto mb-5"><Inbox className="h-5 w-5" /></span>
        <p className="novamail-auth-eyebrow">{t("brand.name")}</p>
        <div className="novamail-not-found-code">404</div>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground">
          {t("notFound.title")}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          {t("notFound.description")}
        </p>
        <Button asChild className="mt-7 rounded-xl px-5">
          <Link href="/">
            <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
            {t("notFound.home")}
          </Link>
        </Button>
      </div>
    </div>
  );
}
