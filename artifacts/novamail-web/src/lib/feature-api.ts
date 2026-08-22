const API_BASE = "/api";

function accessToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("novamail-access") || localStorage.getItem("novamail-access");
}

export class FeatureRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "FeatureRequestError";
    this.status = status;
  }
}

export async function featureRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  const token = accessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new FeatureRequestError(
      typeof payload?.error === "string" ? payload.error : "Request failed",
      response.status,
    );
  }
  return payload as T;
}

export type AiWriteOperation = "draft" | "rephrase" | "shorten" | "quick_reply";
export type EmailCategory = "primary" | "promotional" | "updates" | "social";
export type FollowUpStatus = "open" | "snoozed" | "completed" | "dismissed";
export type WorkspaceEmail = { id: string; subject: string; fromEmail: string; isRead: boolean; isStarred: boolean; category: EmailCategory; bodyText: string; labels: string[] | null; createdAt: string };
export type SmartInboxItem = { email: WorkspaceEmail; score: number; reasons: string[] };
export type WorkspaceTask = { id: string; title: string; status: "open" | "completed"; priority: string; dueAt: string | null; emailId?: string | null };
export type WorkspaceEvent = { id: string; title: string; startsAt: string; endsAt: string; location: string | null; emailId?: string | null };
export type WorkspaceFollowUp = { id: string; emailId: string; remindAt: string; status: FollowUpStatus; note: string; waitingForReply: boolean; emailSubject: string; fromEmail: string };
export type WorkspacePreferences = {
  userId: string;
  inboxDensity: "comfortable" | "compact";
  inboxLayout: "two-pane" | "list" | "split";
  visibleSections: string[];
  visibleColumns: string[];
  accentColor: string;
  theme: "light" | "dark" | "system";
  keyboardShortcuts: Record<string, string>;
  savedSearches: string[];
};

export function aiWrite(input: { operation: AiWriteOperation; instruction?: string; context?: string; threadText?: string }) {
  return featureRequest<{ text: string; operation: AiWriteOperation }>("/ai/write", { method: "POST", body: JSON.stringify(input) });
}

export type ProductivityInsight = {
  summary: string;
  suggestedReply: string | null;
  tasks: Array<{ title: string; dueAt: string | null; priority: "low" | "normal" | "high" }>;
  events: Array<{ title: string; startsAt: string | null; endsAt: string | null }>;
  priority: "low" | "normal" | "high";
  needsFollowUp: boolean;
  confidence: number;
};

export function aiProductivityInsights(emailId: string) {
  return featureRequest<ProductivityInsight>(`/ai/insights/${encodeURIComponent(emailId)}`, { method: "POST" });
}

export function summarizeEmail(emailId: string) {
  return featureRequest<{ summary: string }>(`/ai/summary/${encodeURIComponent(emailId)}`, { method: "POST" });
}

export function categorizeEmail(emailId: string) {
  return featureRequest<{ category: EmailCategory; confidence: number }>(`/ai/categorize/${encodeURIComponent(emailId)}`, { method: "POST" });
}

export function snoozeEmail(emailId: string, until: string) {
  return featureRequest(`/emails/${encodeURIComponent(emailId)}/snooze`, { method: "PATCH", body: JSON.stringify({ until }) });
}

export function createTask(input: { title: string; notes?: string; emailId?: string; dueAt?: string; priority?: "low" | "normal" | "high" }) {
  return featureRequest("/productivity/tasks", { method: "POST", body: JSON.stringify(input) });
}

export function suggestCalendar(emailId: string) {
  return featureRequest<{ detected: boolean; title: string; start: string | null; end: string | null; attendees: string[] } | null>(`/productivity/calendar/suggest/${encodeURIComponent(emailId)}`, { method: "POST" });
}

export function createCalendarEvent(input: { emailId?: string; title: string; description?: string; startsAt: string; endsAt: string; attendees?: string[]; location?: string }) {
  return featureRequest("/productivity/calendar/events", { method: "POST", body: JSON.stringify(input) });
}

export function listTasks() {
  return featureRequest<{ tasks: Array<{ id: string; title: string; status: "open" | "completed"; priority: string; dueAt: string | null }> }>("/productivity/tasks");
}

export function updateTask(id: string, input: { status?: "open" | "completed"; title?: string; priority?: "low" | "normal" | "high" }) {
  return featureRequest(`/productivity/tasks/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function listCalendarEvents() {
  return featureRequest<{ events: Array<{ id: string; title: string; startsAt: string; endsAt: string; location: string | null }> }>("/productivity/calendar/events");
}

export function createTemplate(input: { name: string; subject?: string; bodyText?: string; bodyHtml?: string }) {
  return featureRequest("/productivity/templates", { method: "POST", body: JSON.stringify(input) });
}

export function listTemplates() {
  return featureRequest<{ templates: Array<{ id: string; name: string; subject: string; bodyHtml: string; bodyText: string }> }>("/productivity/templates");
}

export function getWorkspacePreferences() {
  return featureRequest<WorkspacePreferences>("/productivity/preferences");
}

export function updateWorkspacePreferences(input: Partial<WorkspacePreferences>) {
  return featureRequest<WorkspacePreferences>("/productivity/preferences", { method: "PATCH", body: JSON.stringify(input) });
}

export function workspaceSnapshot(query = "") {
  const params = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
  return featureRequest<{
    smartInbox: { queryPlan: { raw: string; terms: string; filters: string[] }; emails: SmartInboxItem[] };
    overdueTasks: WorkspaceTask[];
    tasks: WorkspaceTask[];
    upcomingEvents: WorkspaceEvent[];
    drafts: Array<{ id: string; subject: string; createdAt: string }>;
    followUps: WorkspaceFollowUp[];
    generatedAt: string;
  }>(`/productivity/workspace${params}`);
}

export function listSmartInbox(query = "") {
  const params = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
  return featureRequest<{ queryPlan: { raw: string; terms: string; filters: string[] }; emails: SmartInboxItem[] }>(`/productivity/smart-inbox${params}`);
}

export function createFollowUp(input: { emailId: string; remindAt: string; note?: string; waitingForReply?: boolean }) {
  return featureRequest<WorkspaceFollowUp>("/productivity/follow-ups", { method: "POST", body: JSON.stringify(input) });
}

export function updateFollowUp(id: string, input: { status?: FollowUpStatus; remindAt?: string; note?: string }) {
  return featureRequest<WorkspaceFollowUp>(`/productivity/follow-ups/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function analyticsOverview() {
  return featureRequest<{ totalEmails: number; unreadEmails: number; storageBytes: number; peakHour: number; activityByHour: Array<{ hour: number; count: number }> }>("/productivity/analytics/overview");
}
