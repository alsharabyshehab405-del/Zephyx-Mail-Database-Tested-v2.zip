import { customFetch } from "@workspace/api-client-react";

export type GmailStatus = {
  configured: boolean;
  connected: boolean;
  migrationRequired: boolean;
  email: string | null;
  lastSyncedAt: string | null;
};

export type GmailConnectResponse = {
  url: string;
};

export type GmailSyncResponse = {
  imported: number;
  checked: number;
  fullSync: boolean;
  email: string;
  lastSyncedAt: string;
};

export function getGmailStatus(): Promise<GmailStatus> {
  return customFetch<GmailStatus>("/api/gmail/status", {
    method: "GET",
    responseType: "json",
  });
}

export function createGmailConnectUrl(): Promise<GmailConnectResponse> {
  return customFetch<GmailConnectResponse>("/api/gmail/connect", {
    method: "POST",
    responseType: "json",
    body: JSON.stringify({}),
  });
}

export function syncGmail(): Promise<GmailSyncResponse> {
  return customFetch<GmailSyncResponse>("/api/gmail/sync", {
    method: "POST",
    responseType: "json",
    body: JSON.stringify({}),
  });
}

export function disconnectGmail(): Promise<null> {
  return customFetch<null>("/api/gmail/connection", {
    method: "DELETE",
    responseType: "auto",
  });
}
