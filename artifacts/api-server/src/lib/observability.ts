type Counter = { count: number; totalMs: number };
const httpByStatus = new Map<string, Counter>();
const operationDurations = new Map<string, Counter>();

export function recordHttpRequest(statusCode: number, durationMs: number): void {
  const key = String(statusCode);
  const current = httpByStatus.get(key) ?? { count: 0, totalMs: 0 };
  current.count += 1;
  current.totalMs += Math.max(0, durationMs);
  httpByStatus.set(key, current);
}

export type OperationName = "search" | "gmail_sync" | "notification_delivery" | "email_dispatch" | "worker_failure";

export function recordOperation(name: OperationName, durationMs: number): void {
  const current = operationDurations.get(name) ?? { count: 0, totalMs: 0 };
  current.count += 1;
  current.totalMs += Math.max(0, durationMs);
  operationDurations.set(name, current);
}

export function redactTelemetry(input: Record<string, unknown>): Record<string, unknown> {
  const forbidden = /password|token|authorization|cookie|secret|body|attachment|query/i;
  return Object.fromEntries(Object.entries(input).filter(([key]) => !forbidden.test(key)));
}

export function observabilityPrometheus(): string {
  const lines = [
    "# HELP zephyx_http_requests_total HTTP responses by status code.",
    "# TYPE zephyx_http_requests_total counter",
  ];
  for (const [status, metric] of httpByStatus) lines.push(`zephyx_http_requests_total{status=\"${status}\"} ${metric.count}`);
  lines.push("# HELP zephyx_operation_duration_ms_total Total duration by safe operation name.", "# TYPE zephyx_operation_duration_ms_total counter");
  lines.push("# HELP zephyx_operation_total Completed operations by safe operation name.", "# TYPE zephyx_operation_total counter");
  for (const [name, metric] of operationDurations) {
    lines.push(`zephyx_operation_total{operation=\"${name}\"} ${metric.count}`);
    lines.push(`zephyx_operation_duration_ms_total{operation=\"${name}\"} ${metric.totalMs}`);
  }
  return `${lines.join("\n")}\n`;
}

export function clearObservabilityForTests(): void {
  httpByStatus.clear();
  operationDurations.clear();
}
