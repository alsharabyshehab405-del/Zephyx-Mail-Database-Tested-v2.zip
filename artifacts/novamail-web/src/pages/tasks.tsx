import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { listTasks, updateTask } from "@/lib/feature-api";

type Task = { id: string; title: string; status: "open" | "completed"; priority: string; dueAt: string | null };

export default function Tasks() {
  const [, setLocation] = useLocation();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = () => listTasks().then((result) => setTasks(result.tasks)).finally(() => setLoading(false));
  useEffect(() => { void refresh(); }, []);

  return (
    <main className="min-h-screen bg-background p-6 md:p-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div><p className="text-sm text-muted-foreground">Productivity</p><h1 className="text-3xl font-bold">Tasks</h1></div>
          <Button variant="outline" onClick={() => setLocation("/")}>Back to inbox</Button>
        </div>
        {loading ? <p className="text-muted-foreground">Loading tasks…</p> : tasks.length === 0 ? <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">No tasks yet. Convert an email into a task from the reader.</div> : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <div key={task.id} className={`flex items-center gap-4 rounded-xl border p-4 ${task.status === "completed" ? "opacity-60" : ""}`}>
                <input type="checkbox" checked={task.status === "completed"} onChange={() => void updateTask(task.id, { status: task.status === "completed" ? "open" : "completed" }).then(refresh)} aria-label={`Complete ${task.title}`} />
                <div className="min-w-0 flex-1"><p className="font-medium">{task.title}</p><p className="text-xs text-muted-foreground">Priority: {task.priority}{task.dueAt ? ` · Due ${new Date(task.dueAt).toLocaleString()}` : ""}</p></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
