import { Globe2 } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { isLocale, LOCALE_OPTIONS } from "@/lib/i18n-config";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = useI18n();

  return (
    <Select
      value={locale}
      onValueChange={(value) => {
        if (isLocale(value)) setLocale(value);
      }}
    >
      <SelectTrigger
        className={cn(
          "novamail-language-switcher h-9 w-[9.5rem] max-w-[46vw] gap-2 rounded-lg bg-background/55 text-xs shadow-none backdrop-blur",
          className,
        )}
        aria-label="Language"
      >
        <Globe2 className="h-3.5 w-3.5 shrink-0 text-primary" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LOCALE_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
