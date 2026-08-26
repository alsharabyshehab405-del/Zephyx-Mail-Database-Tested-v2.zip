import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { aiWrite, type AiWriteOperation } from "@/lib/feature-api";

const operations: Array<{ id: AiWriteOperation; label: string; description: string }> = [
  { id: "draft", label: "كتابة مسودة", description: "اكتب رسالة من تعليمات قصيرة." },
  { id: "rephrase", label: "إعادة الصياغة", description: "اجعل النص أوضح وأكثر احترافية." },
  { id: "shorten", label: "اختصار", description: "قلّل طول الرسالة مع الحفاظ على المعنى." },
  { id: "quick_reply", label: "رد سريع", description: "أنشئ رداً مختصراً ومناسباً." },
];

export default function AiAssistant() {
  const [, setLocation] = useLocation();
  const [operation, setOperation] = useState<AiWriteOperation>("draft");
  const [instruction, setInstruction] = useState("");
  const [context, setContext] = useState("");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = operations.find((item) => item.id === operation);

  const run = async () => {
    if (!instruction.trim() && !context.trim()) return;
    setBusy(true);
    try {
      const response = await aiWrite({ operation, instruction, context });
      setResult(response.text);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main dir="rtl" className="min-h-screen bg-background p-6 md:p-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div><p className="text-sm text-muted-foreground">Zephyx AI</p><h1 className="text-3xl font-bold">مساعد البريد الذكي</h1><p className="mt-2 text-muted-foreground">اكتب، أعد الصياغة، اختصر، أو أنشئ رداً سريعاً من مكان واحد.</p></div>
          <Button variant="outline" onClick={() => setLocation("/")}>العودة إلى الوارد</Button>
        </div>
        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <section className="space-y-2 rounded-xl border p-3">
            {operations.map((item) => <button type="button" key={item.id} onClick={() => setOperation(item.id)} className={`w-full rounded-lg p-3 text-start transition-colors ${operation === item.id ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}><p className="font-medium">{item.label}</p><p className="mt-1 text-xs text-muted-foreground">{item.description}</p></button>)}
          </section>
          <section className="rounded-xl border p-5">
            <h2 className="font-semibold">{selected?.label}</h2>
            <div className="mt-4 space-y-3"><textarea className="min-h-28 w-full rounded-md border bg-background p-3 text-sm" placeholder="اكتب تعليماتك للذكاء الاصطناعي" value={instruction} onChange={(event) => setInstruction(event.target.value)} /><textarea className="min-h-40 w-full rounded-md border bg-background p-3 text-sm" placeholder="النص أو سياق المحادثة (اختياري)" value={context} onChange={(event) => setContext(event.target.value)} /><Button onClick={() => void run()} disabled={busy || (!instruction.trim() && !context.trim())}>{busy ? "جارٍ الإنشاء…" : "تشغيل المساعد"}</Button></div>
            {result && <div className="mt-6 rounded-lg bg-muted/50 p-4"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">النتيجة</p><p className="whitespace-pre-wrap text-sm leading-7">{result}</p></div>}
          </section>
        </div>
      </div>
    </main>
  );
}
