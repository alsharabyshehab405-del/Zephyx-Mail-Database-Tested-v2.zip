import readline from "node:readline";
import app from "../app.js";
import { publishUserEvent } from "../lib/realtime.js";

const port = Number(process.env.PORT ?? 0);
const server = app.listen(port, "127.0.0.1", () => {
  process.stdout.write(`READY:${port}\n`);
});

const input = readline.createInterface({ input: process.stdin });
input.on("line", (line) => {
  void (async () => {
    try {
      const command = JSON.parse(line) as { commandId?: string; userId?: string; event?: string; data?: unknown };
      if (!command.commandId || !command.userId || !["email.created", "email.updated", "notification.updated"].includes(command.event ?? "")) return;
      await publishUserEvent(command.userId, {
        event: command.event as "email.created" | "email.updated" | "notification.updated",
        data: command.data as { emailId?: string; notificationId?: string; change: "created" | "updated" | "deleted" },
      });
      process.stdout.write(`PUBLISHED:${command.commandId}\n`);
    } catch {
      // Invalid test IPC commands are ignored; they are never part of production API input.
    }
  })();
});

const close = () => {
  input.close();
  server.close(() => process.exit(0));
};
process.once("SIGTERM", close);
process.once("SIGINT", close);
