import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createTemplate, listTemplates } from "@/lib/feature-api";

export default function Templates() {
  const [, setLocation] = useLocation();
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; subject: string; bodyText: string }>>([]);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const refresh = () => listTemplates().then((result) => setTemplates(result.templates)).catch(() => undefined);
  useEffect(() => { void refresh(); }, []);
  const save = async () => { if (!name.trim() || !bodyText.trim()) return; await createTemplate({ name, subject, bodyText, bodyHtml: `<p>${bodyText.replace(/\n/g, "<br/>")}</p>` }); setName(""); setSubject(""); setBodyText(""); await refresh(); };
  return <main className="min-h-screen bg-background p-6 md:p-10"><div className="mx-auto max-w-4xl">
    <div className="mb-8 flex items-center justify-between gap-4"><div><p className="text-sm text-muted-foreground">Productivity</p><h1 className="text-3xl font-bold">Canned responses</h1></div><Button variant="outline" onClick={() => setLocation("/")}>Back to inbox</Button></div>
    <section className="rounded-xl border p-5"><h2 className="font-semibold">Create template</h2><div className="mt-4 grid gap-3"><Input placeholder="Template name" value={name} onChange={(event) => setName(event.target.value)} /><Input placeholder="Subject (optional)" value={subject} onChange={(event) => setSubject(event.target.value)} /><textarea className="min-h-32 rounded-md border bg-background p-3 text-sm" placeholder="Reusable response" value={bodyText} onChange={(event) => setBodyText(event.target.value)} /><Button onClick={() => void save()} disabled={!name.trim() || !bodyText.trim()}>Save template</Button></div></section>
    <section className="mt-6 space-y-3">{templates.map((template) => <article key={template.id} className="rounded-xl border p-5"><h2 className="font-semibold">{template.name}</h2>{template.subject && <p className="mt-1 text-xs text-muted-foreground">Subject: {template.subject}</p>}<p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{template.bodyText}</p></article>)}</section>
  </div></main>;
}
