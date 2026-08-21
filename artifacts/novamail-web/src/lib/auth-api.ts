import { customFetch } from "@workspace/api-client-react";

export interface ApiMessage {
  message: string;
}

export interface AuthSession {
  id: string;
  deviceName: string | null;
  userAgentShort: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  isCurrent: boolean;
}

export interface SessionsResponse {
  sessions: AuthSession[];
}

export interface RevokeAllSessionsResponse extends ApiMessage {
  revokedCount: number;
}

export function requestPasswordReset(email: string): Promise<ApiMessage> {
  return customFetch<ApiMessage>("/api/auth/password/forgot", {
    method: "POST",
    responseType: "json",
    body: JSON.stringify({ email }),
  });
}

export function resetPassword(token: string, newPassword: string): Promise<ApiMessage> {
  return customFetch<ApiMessage>("/api/auth/password/reset", {
    method: "POST",
    responseType: "json",
    body: JSON.stringify({ token, newPassword }),
  });
}

export function requestEmailVerification(): Promise<ApiMessage> {
  return customFetch<ApiMessage>("/api/auth/email-verification/request", {
    method: "POST",
    responseType: "json",
    body: JSON.stringify({}),
  });
}

export function confirmEmailVerification(token: string): Promise<ApiMessage> {
  return customFetch<ApiMessage>("/api/auth/email-verification/confirm", {
    method: "POST",
    responseType: "json",
    body: JSON.stringify({ token }),
  });
}

export function listSessions(): Promise<SessionsResponse> {
  return customFetch<SessionsResponse>("/api/auth/sessions", {
    method: "GET",
    responseType: "json",
  });
}

export function revokeSession(sessionId: string): Promise<null> {
  return customFetch<null>(`/api/auth/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
    responseType: "auto",
  });
}

export function revokeAllSessions(
  keepCurrentSession: boolean,
): Promise<RevokeAllSessionsResponse> {
  return customFetch<RevokeAllSessionsResponse>("/api/auth/sessions/revoke-all", {
    method: "POST",
    responseType: "json",
    body: JSON.stringify({ keepCurrentSession }),
  });
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null) {
    const candidate = error as {
      message?: unknown;
      data?: { error?: unknown } | null;
      response?: { data?: { error?: unknown } };
      error?: unknown;
    };

    if (typeof candidate.data?.error === "string") return candidate.data.error;
    if (typeof candidate.response?.data?.error === "string") return candidate.response.data.error;
    if (typeof candidate.error === "string") return candidate.error;
    if (typeof candidate.message === "string" && candidate.message.trim()) return candidate.message;
  }

  return fallback;
}

export interface TwoFactorAuthenticatedResponse {
  twoFactorRequired: false;
  accessToken: string;
  refreshToken: string;
  user: import("@workspace/api-client-react").User;
}

export interface TwoFactorChallengeResponse {
  twoFactorRequired: true;
  challengeToken: string;
  expiresInSeconds: number;
}

export type TwoFactorLoginResponse = TwoFactorAuthenticatedResponse | TwoFactorChallengeResponse;

export interface TwoFactorStatusResponse {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesRemaining: number;
}

export interface TwoFactorSetupResponse {
  qrCodeDataUrl: string;
  manualEntryKey: string;
  issuer: string;
  account: string;
}

export function loginWithPassword(email: string, password: string): Promise<TwoFactorLoginResponse> {
  return customFetch<TwoFactorLoginResponse>("/api/auth/login", {
    method: "POST",
    responseType: "json",
    body: JSON.stringify({ email, password }),
  });
}

export function verifyTwoFactorLogin(challengeToken: string, code: string): Promise<TwoFactorAuthenticatedResponse> {
  return customFetch<TwoFactorAuthenticatedResponse>("/api/auth/2fa/login/verify", {
    method: "POST",
    responseType: "json",
    body: JSON.stringify({ challengeToken, code }),
  });
}

export function getTwoFactorStatus(): Promise<TwoFactorStatusResponse> {
  return customFetch<TwoFactorStatusResponse>("/api/auth/2fa/status", { method: "GET", responseType: "json" });
}

export function beginTwoFactorSetup(password: string): Promise<TwoFactorSetupResponse> {
  return customFetch<TwoFactorSetupResponse>("/api/auth/2fa/setup", {
    method: "POST", responseType: "json", body: JSON.stringify({ password }),
  });
}

export function enableTwoFactor(code: string): Promise<{ enabled: true; recoveryCodes: string[] }> {
  return customFetch("/api/auth/2fa/enable", {
    method: "POST", responseType: "json", body: JSON.stringify({ code }),
  });
}

export function disableTwoFactor(password: string, code: string): Promise<ApiMessage> {
  return customFetch<ApiMessage>("/api/auth/2fa/disable", {
    method: "POST", responseType: "json", body: JSON.stringify({ password, code }),
  });
}

export function regenerateTwoFactorRecoveryCodes(password: string, code: string): Promise<{ recoveryCodes: string[] }> {
  return customFetch("/api/auth/2fa/recovery/regenerate", {
    method: "POST", responseType: "json", body: JSON.stringify({ password, code }),
  });
}
