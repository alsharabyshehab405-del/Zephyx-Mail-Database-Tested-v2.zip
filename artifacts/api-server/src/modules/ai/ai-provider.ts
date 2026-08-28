import type { EmailAction } from "../emails/action-engine.js";
import type { AiWriteOperation, AiWriteResult, SmartSummaryResult } from "./ai.service.js";

export type AiProviderState = "CONFIGURED" | "NOT_CONFIGURED";

export type AiProviderInput = {
  userId: string;
  organizationId?: string | null;
  text: string;
  consentGranted: boolean;
};

export interface AiProvider {
  readonly state: AiProviderState;
  summarize(input: AiProviderInput & { mode: "short" | "detailed" | "key_points" | "action_items" }): Promise<SmartSummaryResult>;
  compose(input: AiProviderInput & { operation: AiWriteOperation; instruction?: string }): Promise<AiWriteResult>;
  classify(input: AiProviderInput): Promise<{ category: string; providerState: AiProviderState }>;
  extractActions(input: AiProviderInput): Promise<{ actions: EmailAction[]; providerState: AiProviderState }>;
  extractPlannerItems(input: AiProviderInput): Promise<{ items: unknown[]; providerState: AiProviderState }>;
}

export class NotConfiguredAiProvider implements AiProvider {
  readonly state = "NOT_CONFIGURED" as const;
  private unavailable<T>(): Promise<T> {
    return Promise.reject(Object.assign(new Error("AI provider is not configured"), { statusCode: 503, providerState: "NOT_CONFIGURED" }));
  }
  summarize(): Promise<SmartSummaryResult> { return this.unavailable<SmartSummaryResult>(); }
  compose(): Promise<AiWriteResult> { return this.unavailable<AiWriteResult>(); }
  classify(): Promise<{ category: string; providerState: AiProviderState }> { return this.unavailable<{ category: string; providerState: AiProviderState }>(); }
  extractActions(): Promise<{ actions: EmailAction[]; providerState: AiProviderState }> { return this.unavailable<{ actions: EmailAction[]; providerState: AiProviderState }>(); }
  extractPlannerItems(): Promise<{ items: unknown[]; providerState: AiProviderState }> { return this.unavailable<{ items: unknown[]; providerState: AiProviderState }>(); }
}

export function getAiProvider(): AiProvider {
  // Provider construction remains deliberately unconfigured until the project owner supplies credentials and consent policy.
  return new NotConfiguredAiProvider();
}
