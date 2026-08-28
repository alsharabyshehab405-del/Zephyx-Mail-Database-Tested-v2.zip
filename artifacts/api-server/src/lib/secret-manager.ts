export type SecretVersionState = "active" | "revoked" | "not_configured";

export type SecretMetadata = {
  name: string;
  version: string | null;
  state: SecretVersionState;
  createdAt: string | null;
  expiresAt: string | null;
};

export interface SecretManager {
  /** Return a secret value only to trusted server-side callers; never log or expose it. */
  get(name: string, version?: string): Promise<string | undefined>;
  metadata(name: string, version?: string): Promise<SecretMetadata>;
  rotate(name: string): Promise<SecretMetadata>;
  revoke(name: string, version?: string): Promise<void>;
}

export class SecretManagerNotConfiguredError extends Error {
  readonly code = "SECRET_MANAGER_NOT_CONFIGURED";

  constructor() {
    super("Secret Manager is not configured");
    this.name = "SecretManagerNotConfiguredError";
  }
}

/**
 * Safe default for local and unprovisioned environments. It deliberately never
 * falls back to process.env, files, or generated values. A deployment-specific
 * KMS/Secret Manager adapter can implement the interface later.
 */
export class NotConfiguredSecretManager implements SecretManager {
  async get(_name: string, _version?: string): Promise<string | undefined> {
    return undefined;
  }

  async metadata(name: string, _version?: string): Promise<SecretMetadata> {
    return { name, version: null, state: "not_configured", createdAt: null, expiresAt: null };
  }

  async rotate(_name: string): Promise<SecretMetadata> {
    throw new SecretManagerNotConfiguredError();
  }

  async revoke(_name: string, _version?: string): Promise<void> {
    throw new SecretManagerNotConfiguredError();
  }
}

export function createSecretManager(_env: NodeJS.ProcessEnv = process.env): SecretManager {
  // Do not infer credentials from environment variables. A real adapter must
  // be explicitly wired by the deployment and must implement rotation/revocation.
  return new NotConfiguredSecretManager();
}

export function secretManagerStatus(manager: SecretManager): "configured" | "not_configured" {
  return manager instanceof NotConfiguredSecretManager ? "not_configured" : "configured";
}
