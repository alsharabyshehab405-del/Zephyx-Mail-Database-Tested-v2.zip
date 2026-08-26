import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, KeyRound, RefreshCw, ShieldCheck, ShieldOff } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { useToast } from "@/hooks/use-toast";
import { beginTwoFactorSetup, disableTwoFactor, enableTwoFactor, getApiErrorMessage, getTwoFactorStatus, regenerateTwoFactorRecoveryCodes, type TwoFactorSetupResponse } from "@/lib/auth-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

export function TwoFactorSettings() {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const { toast } = useToast();
  const qc = useQueryClient();
  const [setup, setSetup] = useState<TwoFactorSetupResponse | null>(null);
  const [setupPassword, setSetupPassword] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const status = useQuery({ queryKey: ["two-factor-status"], queryFn: getTwoFactorStatus });
  const setupM = useMutation({ mutationFn: () => beginTwoFactorSetup(setupPassword), onSuccess: (d) => { setSetup(d); setSetupPassword(""); }, onError: (e) => toast({ title: ar ? "حدث خطأ" : "Error", description: getApiErrorMessage(e, ar ? "تعذر بدء الإعداد" : "Could not start setup"), variant: "destructive" }) });
  const enableM = useMutation({ mutationFn: () => enableTwoFactor(confirmCode), onSuccess: (d) => { setRecoveryCodes(d.recoveryCodes); setSetup(null); setConfirmCode(""); void qc.invalidateQueries({queryKey:["two-factor-status"]}); void qc.invalidateQueries({queryKey:["auth-sessions"]}); toast({title: ar ? "تم تفعيل التحقق بخطوتين" : "Two-factor authentication enabled"}); }, onError: (e) => toast({ title: ar ? "حدث خطأ" : "Error", description: getApiErrorMessage(e, ar ? "رمز غير صحيح" : "Invalid code"), variant: "destructive" }) });
  const disableM = useMutation({ mutationFn: () => disableTwoFactor(password, code), onSuccess: () => { setPassword(""); setCode(""); void qc.invalidateQueries({queryKey:["two-factor-status"]}); void qc.invalidateQueries({queryKey:["auth-sessions"]}); toast({title: ar ? "تم تعطيل التحقق بخطوتين" : "Two-factor authentication disabled"}); }, onError: (e) => toast({ title: ar ? "حدث خطأ" : "Error", description: getApiErrorMessage(e, ar ? "تعذر التعطيل" : "Could not disable 2FA"), variant: "destructive" }) });
  const regenM = useMutation({ mutationFn: () => regenerateTwoFactorRecoveryCodes(password, code), onSuccess: (d) => { setRecoveryCodes(d.recoveryCodes); setPassword(""); setCode(""); void qc.invalidateQueries({queryKey:["two-factor-status"]}); toast({title: ar ? "تم إنشاء رموز جديدة" : "New recovery codes generated"}); }, onError: (e) => toast({ title: ar ? "حدث خطأ" : "Error", description: getApiErrorMessage(e, ar ? "تعذر إنشاء الرموز" : "Could not regenerate codes"), variant: "destructive" }) });
  const pending=setupM.isPending||enableM.isPending||disableM.isPending||regenM.isPending;
  const copyCodes=async()=>{ try { await navigator.clipboard.writeText(recoveryCodes.join("\n")); setCopied(true); setTimeout(()=>setCopied(false),1500); } catch {} };

  return <Card className="novamail-settings-card">
    <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary"/><CardTitle>{ar ? "التحقق بخطوتين (2FA)" : "Two-factor authentication (2FA)"}</CardTitle></div>{status.data && <Badge variant={status.data.enabled ? "default" : "secondary"}>{status.data.enabled ? (ar?"مفعّل":"Enabled") : (ar?"غير مفعّل":"Not enabled")}</Badge>}</div><CardDescription>{ar ? "احمِ حسابك بتطبيق مصادقة ورموز استرداد تستخدم لمرة واحدة." : "Protect your account with an authenticator app and one-time recovery codes."}</CardDescription></CardHeader>
    <CardContent className="space-y-5">
      {status.isLoading && <p className="text-sm text-muted-foreground">{ar?"جارٍ التحميل...":"Loading..."}</p>}
      {status.isError && <Button variant="outline" size="sm" onClick={()=>status.refetch()}>{ar?"إعادة المحاولة":"Retry"}</Button>}
      {recoveryCodes.length>0 && <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4"><div className="flex items-start gap-3"><KeyRound className="mt-0.5 h-5 w-5 text-amber-600"/><div className="flex-1"><p className="font-semibold">{ar?"احفظ رموز الاسترداد الآن":"Save your recovery codes now"}</p><p className="mt-1 text-sm text-muted-foreground">{ar?"كل رمز يعمل مرة واحدة. لن تظهر هذه الرموز مرة أخرى.":"Each code works once. These codes will not be shown again."}</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{recoveryCodes.map(c=><code key={c} className="rounded-md border bg-background px-3 py-2 text-center text-sm font-semibold">{c}</code>)}</div><div className="mt-4 flex gap-2"><Button variant="outline" onClick={copyCodes}>{copied?<Check className="mr-2 h-4 w-4"/>:<Copy className="mr-2 h-4 w-4"/>}{copied?(ar?"تم النسخ":"Copied"):(ar?"نسخ الرموز":"Copy codes")}</Button><Button onClick={()=>setRecoveryCodes([])}>{ar?"حفظتها":"I saved them"}</Button></div></div></div></div>}
      {status.data && !status.data.enabled && !setup && <div className="space-y-4 rounded-xl border p-4"><p className="text-sm text-muted-foreground">{ar?"أدخل كلمة المرور لبدء تفعيل تطبيق المصادقة.":"Enter your password to start authenticator setup."}</p><Input type="password" autoComplete="current-password" value={setupPassword} onChange={e=>setSetupPassword(e.target.value)} placeholder={ar?"كلمة المرور الحالية":"Current password"}/><Button disabled={!setupPassword||pending} onClick={()=>setupM.mutate()}>{setupM.isPending?(ar?"جارٍ التحميل...":"Loading..."):(ar?"متابعة":"Continue")}</Button></div>}
      {setup && <div className="space-y-4 rounded-xl border p-4"><p className="font-semibold">{ar?"امسح رمز QR بتطبيق المصادقة":"Scan the QR code with your authenticator app"}</p><div className="rounded-2xl bg-white p-3 w-fit"><img src={setup.qrCodeDataUrl} alt="2FA QR" className="h-52 w-52"/></div><div><p className="text-sm font-medium">{ar?"مفتاح الإدخال اليدوي":"Manual setup key"}</p><code className="mt-2 block break-all rounded-lg border bg-muted/40 p-3 text-sm">{setup.manualEntryKey}</code></div><Input inputMode="numeric" autoComplete="one-time-code" value={confirmCode} onChange={e=>setConfirmCode(e.target.value.replace(/\D/g,"").slice(0,6))} placeholder="123456" maxLength={6}/><div className="flex gap-2"><Button disabled={confirmCode.length!==6||pending} onClick={()=>enableM.mutate()}>{ar?"تفعيل 2FA":"Enable 2FA"}</Button><Button variant="outline" onClick={()=>{setSetup(null);setConfirmCode("")}}>{ar?"إلغاء":"Cancel"}</Button></div></div>}
      {status.data?.enabled && <div className="space-y-4"><div className="rounded-xl border bg-primary/5 p-4"><p className="font-medium">{ar?"الحماية مفعّلة":"Protection enabled"}</p><p className="mt-1 text-sm text-muted-foreground">{ar?`رموز الاسترداد المتبقية: ${status.data.recoveryCodesRemaining}`:`Recovery codes remaining: ${status.data.recoveryCodesRemaining}`}</p></div><Separator/><Input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder={ar?"كلمة المرور الحالية":"Current password"}/><Input autoComplete="one-time-code" value={code} onChange={e=>setCode(e.target.value)} placeholder={ar?"رمز التحقق أو الاسترداد":"Verification or recovery code"}/><div className="flex flex-col gap-2 sm:flex-row"><Button variant="outline" disabled={!password||code.trim().length<6||pending} onClick={()=>regenM.mutate()}><RefreshCw className="mr-2 h-4 w-4"/>{ar?"رموز استرداد جديدة":"New recovery codes"}</Button><Button variant="destructive" disabled={!password||code.trim().length<6||pending} onClick={()=>disableM.mutate()}><ShieldOff className="mr-2 h-4 w-4"/>{ar?"تعطيل 2FA":"Disable 2FA"}</Button></div></div>}
    </CardContent>
  </Card>;
}
