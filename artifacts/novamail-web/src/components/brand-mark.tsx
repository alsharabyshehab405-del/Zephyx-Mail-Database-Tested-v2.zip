import { cn } from "@/lib/utils";
import { Mail } from "lucide-react";

type BrandMarkProps = {
  compact?: boolean;
  className?: string;
};

export function BrandMark({ compact = false, className }: BrandMarkProps) {
  return (
    <span className={cn("novamail-brand-mark", compact && "novamail-brand-mark--compact", className)}>
      <span className="novamail-brand-mark__icon" aria-hidden="true">
        <Mail className="h-4 w-4" strokeWidth={2.3} />
      </span>
      {!compact && (
        <span className="novamail-brand-mark__copy">
          <span className="novamail-brand-mark__name">Zephyx Mail</span>
        </span>
      )}
    </span>
  );
}
