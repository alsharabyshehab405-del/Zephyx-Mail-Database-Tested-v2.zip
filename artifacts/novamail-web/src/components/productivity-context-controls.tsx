import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Loader2, ShieldCheck, UserRound } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  listProductivityAccounts,
  setActiveProductivityAccount,
  setFocusMode,
  type FocusMode,
} from "@/lib/feature-api";

type Props = {
  accountId: string;
  focusMode: FocusMode;
  onAccountChange: (accountId: string) => void;
  onFocusModeChange: (mode: FocusMode) => void;
};

export function ProductivityContextControls({ accountId, focusMode, onAccountChange, onFocusModeChange }: Props) {
  const { t } = useI18n();
  const accountsQuery = useQuery({ queryKey: ["productivity-accounts"], queryFn: listProductivityAccounts });
  const accountMutation = useMutation({
    mutationFn: setActiveProductivityAccount,
    onSuccess: ({ activeAccountId }) => onAccountChange(activeAccountId),
  });
  const focusMutation = useMutation({
    mutationFn: setFocusMode,
    onSuccess: ({ mode }) => onFocusModeChange(mode),
  });
  const accountStatusLabel = (status: string) => {
    if (status === "connected") return t("workspace.accountConnected");
    if (status === "syncing") return t("workspace.accountSyncing");
    if (status === "error") return t("workspace.accountError");
    return t("workspace.accountNotConfigured");
  };

  return (
    <div className="grid gap-3 rounded-2xl border border-border/60 bg-background/80 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end" data-testid="productivity-context-controls">
      <label className="grid gap-1 text-sm font-semibold" htmlFor="productivity-account-switcher">
        <span className="flex items-center gap-2"><UserRound className="h-4 w-4 text-primary" aria-hidden="true" />{t("workspace.accountSwitcher")}</span>
        <select
          id="productivity-account-switcher"
          value={accountId}
          onChange={(event) => {
            const nextAccount = event.target.value;
            onAccountChange(nextAccount);
            accountMutation.mutate(nextAccount === "all" || nextAccount === "local" ? nextAccount === "local" ? null : null : nextAccount);
          }}
          disabled={accountsQuery.isLoading || accountMutation.isPending}
          className="h-10 min-w-0 rounded-md border border-input bg-background px-3"
          aria-describedby="productivity-account-switcher-hint"
        >
          <option value="all">{t("workspace.allAccounts")}</option>
          {accountsQuery.data?.accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.id === "local" ? t("workspace.localAccount") : account.displayName || account.emailAddress} — {accountStatusLabel(account.syncStatus)}
            </option>
          ))}
        </select>
        <span id="productivity-account-switcher-hint" className="text-xs font-normal text-muted-foreground">{t("workspace.accountSwitcherHint")}</span>
      </label>
      <div className="grid gap-1">
        <span className="text-sm font-semibold">{t("workspace.focusMode")}</span>
        <div className="flex flex-wrap gap-1" role="group" aria-label={t("workspace.focusMode")}>
          {(["focus", "work", "follow_up"] as const).map((mode) => (
            <Button
              key={mode}
              type="button"
              size="sm"
              variant={focusMode === mode ? "default" : "outline"}
              onClick={() => focusMutation.mutate(mode)}
              disabled={focusMutation.isPending}
              aria-pressed={focusMode === mode}
              data-testid={`focus-mode-${mode}`}
            >
              {focusMutation.isPending && focusMode === mode ? <Loader2 className="me-1 h-3 w-3 animate-spin" aria-hidden="true" /> : focusMode === mode ? <Check className="me-1 h-3 w-3" aria-hidden="true" /> : null}
              {t(`workspace.focus${mode === "focus" ? "Focus" : mode === "work" ? "Work" : "FollowUp"}`)}
            </Button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">{t("workspace.focusModeHint")}</span>
      </div>
      {accountsQuery.isError ? <p className="text-xs text-destructive sm:col-span-2" role="alert">{t("workspace.accountError")}</p> : null}
      {accountMutation.isError || focusMutation.isError ? <p className="text-xs text-destructive sm:col-span-2" role="alert">{t("workspace.actionFailed")}</p> : null}
      {accountsQuery.data?.providerAvailability.gmail === false ? <Badge variant="outline" className="w-fit gap-1 text-xs sm:col-span-2"><ShieldCheck className="h-3 w-3" aria-hidden="true" />{t("workspace.accountNotConfigured")}: Gmail OAuth</Badge> : null}
    </div>
  );
}
