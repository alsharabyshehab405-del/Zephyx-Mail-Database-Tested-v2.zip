export type UnsubscribeEmail = { id: string; subject: string; bodyText: string; bodyHtml: string; fromEmail: string };

export type UnsubscribeResult = {
  sourceEmailId: string;
  sender: string;
  manualLinks: string[];
  listUnsubscribe: string[];
  state: "MANUAL_LINKS_FOUND" | "NOT_CONFIGURED";
  providerState: "NOT_CONFIGURED";
};

export function extractUnsubscribe(email: UnsubscribeEmail): UnsubscribeResult {
  const text = `${email.subject}\n${email.bodyText}`.slice(0, 20_000);
  const html = email.bodyHtml.slice(0, 40_000);
  const urls = Array.from(new Set([...(text.match(/https?:\/\/[^\s<>"')]+/gi) ?? []), ...(html.match(/https?:\/\/[^\s<>"')]+/gi) ?? [])])).filter((url) => /unsubscribe|optout|opt-out|manage[-_ ]?preferences/i.test(url)).slice(0, 10);
  return {
    sourceEmailId: email.id,
    sender: email.fromEmail,
    manualLinks: urls,
    listUnsubscribe: [],
    state: urls.length > 0 ? "MANUAL_LINKS_FOUND" : "NOT_CONFIGURED",
    providerState: "NOT_CONFIGURED",
  };
}
