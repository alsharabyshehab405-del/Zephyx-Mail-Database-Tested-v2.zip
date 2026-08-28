export const ORGANIZATION_MAILBOX_SCOPE_NOT_CONFIGURED = "ORGANIZATION_MAILBOX_SCOPE_NOT_CONFIGURED" as const;

export function normalizeMailboxScope(value: string | null | undefined): string {
  const scope = value?.trim();
  return scope || "personal";
}

export function assertMailboxScopeConfigured(value: string | null | undefined): "personal" {
  const scope = normalizeMailboxScope(value);
  if (scope !== "personal") {
    throw Object.assign(
      new Error("Organization-scoped mailbox listing is not configured until emails have an organization mapping"),
      { statusCode: 409, code: ORGANIZATION_MAILBOX_SCOPE_NOT_CONFIGURED },
    );
  }
  return "personal";
}
