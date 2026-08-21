export type MailProvider = "gmail" | "outlook";

export type ProviderAccount = {
  provider: MailProvider;
  externalAccountId: string;
  emailAddress: string;
  displayName: string | null;
  syncStatus: "connected" | "revoked" | "not_configured";
};

export interface MailProviderAdapter {
  readonly provider: MailProvider;
  getAuthorizationUrl(userId: string): Promise<string>;
  sync(accountId: string): Promise<{ imported: number }>;
  disconnect(accountId: string): Promise<void>;
}

/** Microsoft Graph OAuth is intentionally not implemented in v5. */
export const outlookAdapter: MailProviderAdapter = {
  provider: "outlook",
  async getAuthorizationUrl() {
    throw Object.assign(new Error("Outlook integration is not configured"), { statusCode: 501 });
  },
  async sync() {
    throw Object.assign(new Error("Outlook integration is not configured"), { statusCode: 501 });
  },
  async disconnect() {
    throw Object.assign(new Error("Outlook integration is not configured"), { statusCode: 501 });
  },
};
