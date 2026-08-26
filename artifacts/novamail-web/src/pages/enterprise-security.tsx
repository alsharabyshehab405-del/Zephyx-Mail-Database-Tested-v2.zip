import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Activity, Check, ClipboardList, FileDown, KeyRound, Plus, ShieldAlert, ShieldCheck, Users, Webhook, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/hooks/use-i18n";
import {
  createEnterpriseOrganization,
  createOrganizationApiKey,
  createOrganizationWebhook,
  createSecurityIncident,
  getOrganizationSecuritySummary,
  listEnterpriseOrganizations,
  listOrganizationApiKeys,
  listOrganizationAuditLogs,
  listOrganizationMembers,
  listOrganizationWebhooks,
  listSecurityIncidents,
  type EnterpriseOrganization,
  type OrganizationSecuritySummary,
  type SecurityIncident,
} from "@/lib/feature-api";

const ONBOARDING_KEY = "zephyx-enterprise-security-onboarding-dismissed";
const stateCopy = {
  safe: { label: "آمنة", description: "لا توجد إشارات خطر معروفة.", action: "يمكنك المتابعة بشكل طبيعي.", icon: ShieldCheck, className: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  suspicious: { label: "مشبوهة", description: "وجدنا إشارة تستحق المراجعة.", action: "راجع التفاصيل قبل المتابعة.", icon: ShieldAlert, className: "text-amber-800 bg-amber-50 border-amber-200" },
  dangerous: { label: "خطرة", description: "قد تحاول الرسالة خداعك أو سرقة معلوماتك.", action: "لا تفتح الروابط أو المرفقات.", icon: ShieldAlert, className: "text-red-800 bg-red-50 border-red-200" },
  blocked: { label: "محجوبة", description: "تم إيقاف المحتوى لحمايتك.", action: "لا تحاول تجاوز الحظر.", icon: X, className: "text-slate-800 bg-slate-100 border-slate-300" },
} as const;

function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)); }

export default function EnterpriseSecurity() {
  const { locale } = useI18n();
  const [organizations, setOrganizations] = useState<EnterpriseOrganization[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [summary, setSummary] = useState<OrganizationSecuritySummary | null>(null);
  const [incidents, setIncidents] = useState<SecurityIncident[]>([]);
  const [members, setMembers] = useState<Array<{ id: string; email: string; name: string; role: string }>>([]);
  const [auditLogs, setAuditLogs] = useState<Array<{ id: string; action: string; success: boolean; createdAt: string }>>([]);
  const [apiKeys, setApiKeys] = useState<Array<{ id: string; name: string; keyPrefix: string; revokedAt: string | null; createdAt: string }>>([]);
  const [webhooks, setWebhooks] = useState<Array<{ id: string; url: string; active: boolean; events: string[] }>>([]);
  const [newOrg, setNewOrg] = useState("");
  const [incidentTitle, setIncidentTitle] = useState("");
  const [incidentDescription, setIncidentDescription] = useState("");
  const [apiKeyName, setApiKeyName] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [oneTimeSecret, setOneTimeSecret] = useState("");
  const [dismissed, setDismissed] = useState(() => typeof window !== "undefined" && window.localStorage.getItem(ONBOARDING_KEY) === "1");
  const [error, setError] = useState("");

  const selected = useMemo(() => organizations.find((organization) => organization.id === organizationId) ?? null, [organizations, organizationId]);
  const canManage = selected?.role === "owner" || selected?.role === "admin";

  async function refreshOrganizations() {
    const result = await listEnterpriseOrganizations();
    setOrganizations(result.organizations);
    if (!organizationId && result.organizations[0]) setOrganizationId(result.organizations[0].id);
  }
  async function refreshOrganization(id: string) {
    if (!id) return;
    const [nextSummary, nextIncidents, nextMembers, nextLogs, nextKeys, nextWebhooks] = await Promise.all([
      getOrganizationSecuritySummary(id), listSecurityIncidents(id), listOrganizationMembers(id), listOrganizationAuditLogs(id), listOrganizationApiKeys(id), listOrganizationWebhooks(id),
    ]);
    setSummary(nextSummary); setIncidents(nextIncidents.incidents); setMembers(nextMembers.members); setAuditLogs(nextLogs.logs); setApiKeys(nextKeys.apiKeys); setWebhooks(nextWebhooks.webhooks);
  }
  useEffect(() => { void refreshOrganizations().catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load organizations")); }, []);
  useEffect(() => { void refreshOrganization(organizationId).catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load security data")); }, [organizationId]);

  async function run(action: () => Promise<void>) { setError(""); try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Request failed"); } }
  async function createOrg() { await run(async () => { const created = await createEnterpriseOrganization(newOrg); setNewOrg(""); setOrganizations((current) => [...current, created]); setOrganizationId(created.id); }); }
  async function createIncident() { if (!organizationId || !incidentTitle.trim()) return; await run(async () => { await createSecurityIncident(organizationId, { title: incidentTitle, description: incidentDescription, severity: "medium" }); setIncidentTitle(""); setIncidentDescription(""); await refreshOrganization(organizationId); }); }
  async function createKey() { if (!organizationId || !apiKeyName.trim()) return; await run(async () => { const created = await createOrganizationApiKey(organizationId, apiKeyName); setApiKeyName(""); setOneTimeSecret(created.secret); await refreshOrganization(organizationId); }); }
  async function createHook() { if (!organizationId || !webhookUrl.trim()) return; await run(async () => { const created = await createOrganizationWebhook(organizationId, { url: webhookUrl, events: ["security.incident.created", "security.report.created"] }); setWebhookUrl(""); setOneTimeSecret(created.secret); await refreshOrganization(organizationId); }); }
  function download(extension: "csv" | "pdf") { if (!organizationId) return; window.open(`/api/enterprise/${encodeURIComponent(organizationId)}/reports.${extension}`, "_blank", "noopener,noreferrer"); }
  function dismissOnboarding() { setDismissed(true); window.localStorage.setItem(ONBOARDING_KEY, "1"); }

  return <main className="container mx-auto max-w-7xl space-y-6 px-4 py-8" dir={locale === "ar" || locale === "ur" ? "rtl" : "ltr"}>
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-primary">Enterprise Security Foundation</p><h1 className="text-3xl font-semibold tracking-tight">مركز أمان المؤسسة</h1><p className="mt-2 max-w-2xl text-muted-foreground">لوحة واضحة للمدير: اعرف ما يحتاج انتباهك، ومن يملك الوصول، وما الذي حدث.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => download("csv")} disabled={!organizationId}><FileDown className="me-2 h-4 w-4" />CSV</Button><Button variant="outline" onClick={() => download("pdf")} disabled={!organizationId}><FileDown className="me-2 h-4 w-4" />PDF</Button></div></header>
    {!dismissed && <section className="rounded-xl border border-primary/20 bg-primary/5 p-5" aria-label="Security onboarding"><div className="flex items-start gap-3"><ShieldCheck className="mt-1 h-5 w-5 text-primary" /><div className="flex-1"><h2 className="font-semibold">ابدأ بأمان المؤسسة في ثلاث خطوات</h2><p className="mt-1 text-sm text-muted-foreground">اختر مؤسسة، راجع ملخص المخاطر، ثم حدّد من يستطيع الإدارة أو التدقيق. لا نفعّل مزودًا خارجيًا دون إعداد حقيقي.</p><div className="mt-3 grid gap-2 text-sm sm:grid-cols-3"><span>1. اختر المؤسسة</span><span>2. راجع الحوادث</span><span>3. صدّر تقريرًا</span></div></div><Button size="sm" variant="ghost" onClick={dismissOnboarding}>حسنًا</Button></div></section>}
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    <section className="rounded-xl border bg-card p-4 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><label className="text-sm font-medium" htmlFor="organization-select">المؤسسة</label><select id="organization-select" className="h-10 rounded-md border bg-background px-3 text-sm" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}><option value="">اختر مؤسسة</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name} — {organization.role}</option>)}</select><Input className="sm:max-w-xs" placeholder="اسم مؤسسة جديدة" value={newOrg} onChange={(event) => setNewOrg(event.target.value)} /><Button onClick={() => void createOrg()} disabled={!newOrg.trim()}><Plus className="me-2 h-4 w-4" />إنشاء</Button></div></section>
    {summary && <>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5" aria-label="Security summary"><Metric icon={<Users />} label="الأعضاء" value={summary.members} /><Metric icon={<Activity />} label="الرسائل المحللة" value={summary.analyzedMessages} /><Metric icon={<ShieldAlert />} label="حوادث مفتوحة" value={summary.openIncidents} tone={summary.openIncidents ? "warning" : "normal"} /><Metric icon={<ShieldAlert />} label="حوادث حرجة" value={summary.criticalIncidents} tone={summary.criticalIncidents ? "danger" : "normal"} /><Metric icon={<ClipboardList />} label="متوسط Risk Score" value={`${summary.averageSpamScore}/100`} /></section>
      <section className="grid gap-4 md:grid-cols-4" aria-label="Risk summary">{Object.entries(summary.riskSummary).map(([key, value]) => { const state = stateCopy[key as keyof typeof stateCopy]; const Icon = state.icon; return <div key={key} className={`rounded-xl border p-4 ${state.className}`}><div className="flex items-center gap-2"><Icon className="h-4 w-4" /><span className="font-medium">{state.label}</span></div><p className="mt-2 text-2xl font-semibold">{value}</p><p className="text-xs opacity-80">رسائل</p></div>; })}</section>
      <div className="grid gap-6 lg:grid-cols-2"><Panel title="الحوادث الأمنية" icon={<ShieldAlert />}><div className="space-y-3">{incidents.length === 0 ? <Empty text="لا توجد حوادث مسجلة." /> : incidents.slice(0, 8).map((incident) => <div key={incident.id} className="rounded-lg border p-3"><div className="flex items-start justify-between gap-2"><div><p className="font-medium">{incident.title}</p><p className="text-xs text-muted-foreground">{incident.description || "بدون وصف"}</p></div><span className="rounded-full bg-muted px-2 py-1 text-xs">{incident.status}</span></div><p className="mt-2 text-xs text-muted-foreground">{incident.severity} · {formatDate(incident.createdAt)}</p></div>)}</div>{canManage && <div className="mt-4 space-y-2 border-t pt-4"><Input placeholder="عنوان حادث جديد" value={incidentTitle} onChange={(event) => setIncidentTitle(event.target.value)} /><Input placeholder="سبب مختصر وإجراء مقترح" value={incidentDescription} onChange={(event) => setIncidentDescription(event.target.value)} /><Button size="sm" onClick={() => void createIncident()} disabled={!incidentTitle.trim()}>تسجيل حادث</Button></div>}</Panel>
      <Panel title="الأعضاء والصلاحيات" icon={<Users />}><div className="space-y-2">{members.map((member) => <div key={member.id} className="flex items-center justify-between rounded-lg border p-3 text-sm"><span><bdi dir="auto">{member.name}</bdi><span className="ms-2 text-muted-foreground"><bdi dir="ltr">{member.email}</bdi></span></span><span className="rounded-full bg-muted px-2 py-1 text-xs">{member.role}</span></div>)}{members.length === 0 && <Empty text="أضف أعضاءً بعد إنشاء المؤسسة." />}</div><p className="mt-3 text-xs text-muted-foreground">Owner وAdmin يديران الإعدادات؛ Security Analyst يدير الحوادث؛ Auditor يقرأ السجلات؛ Member يرى ما تسمح به الملكية.</p></Panel></div>
      <div className="grid gap-6 lg:grid-cols-3"><Panel title="سجل التدقيق" icon={<ClipboardList />}><div className="space-y-2">{auditLogs.slice(0, 6).map((log) => <div key={log.id} className="flex items-center justify-between text-sm"><span>{log.action}</span><span className="text-xs text-muted-foreground">{formatDate(log.createdAt)}</span></div>)}{auditLogs.length === 0 && <Empty text="سيظهر النشاط هنا." />}</div></Panel><Panel title="مفاتيح API" icon={<KeyRound />}><div className="space-y-2">{apiKeys.map((key) => <div key={key.id} className="flex items-center justify-between rounded border p-2 text-sm"><span>{key.name}<span className="ms-2 font-mono text-xs text-muted-foreground">{key.keyPrefix}…</span></span><span>{key.revokedAt ? "revoked" : "active"}</span></div>)}{canManage && <div className="flex gap-2"><Input placeholder="اسم المفتاح" value={apiKeyName} onChange={(event) => setApiKeyName(event.target.value)} /><Button size="sm" onClick={() => void createKey()} disabled={!apiKeyName.trim()}><Plus className="h-4 w-4" /></Button></div>}</div></Panel><Panel title="Webhooks" icon={<Webhook />}><div className="space-y-2">{webhooks.map((hook) => <div key={hook.id} className="rounded border p-2 text-sm"><bdi dir="ltr" className="block truncate">{hook.url}</bdi><span className="text-xs text-muted-foreground">{hook.active ? "active" : "inactive"}</span></div>)}{canManage && <div className="flex gap-2"><Input placeholder="https://example.com/webhook" value={webhookUrl} onChange={(event) => setWebhookUrl(event.target.value)} /><Button size="sm" onClick={() => void createHook()} disabled={!webhookUrl.trim()}><Plus className="h-4 w-4" /></Button></div>}</div></Panel></div>
    </>}
    {oneTimeSecret && <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="status"><b>احفظ السر الآن:</b> سيظهر مرة واحدة فقط. <code className="ms-2 break-all">{oneTimeSecret}</code><Button className="ms-2" size="sm" variant="ghost" onClick={() => setOneTimeSecret("")}>إخفاء</Button></section>}
  </main>;
}

function Metric({ icon, label, value, tone = "normal" }: { icon: ReactNode; label: string; value: string | number; tone?: "normal" | "warning" | "danger" }) { return <div className={`rounded-xl border bg-card p-4 shadow-sm ${tone === "danger" ? "border-red-300" : tone === "warning" ? "border-amber-300" : ""}`}><div className="flex items-center gap-2 text-sm text-muted-foreground">{icon}<span>{label}</span></div><p className="mt-2 text-2xl font-semibold">{value}</p></div>; }
function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) { return <section className="rounded-xl border bg-card p-5 shadow-sm"><h2 className="mb-4 flex items-center gap-2 font-semibold">{icon}{title}</h2>{children}</section>; }
function Empty({ text }: { text: string }) { return <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">{text}</p>; }
