import type { Express } from "express";
import { chatRouter } from "./chat.js";
import { authRouter } from "../modules/auth/auth.controller.js";
import { usersRouter } from "../modules/users/users.controller.js";
import { emailsRouter } from "../modules/emails/emails.controller.js";
import { foldersRouter } from "../modules/folders/folders.controller.js";
import { statsRouter } from "../modules/stats/stats.controller.js";
import { adminRouter } from "../modules/admin/admin.controller.js";
import { gmailOAuthCallback, gmailRouter } from "../modules/gmail/gmail.controller.js";
import { aiRouter } from "../modules/ai/ai.controller.js";
import { productivityRouter } from "../modules/productivity/productivity.controller.js";
import healthRouter from "./health.js";

export function registerRoutes(app: Express): void {
  // Google redirects here without a NovaMail bearer token; the signed OAuth state
  // securely identifies the user who initiated the connection.
  app.get("/api/auth/google/callback", gmailOAuthCallback);

  // Authentication rate limits are applied per sensitive route in authRouter.
  app.use("/api/auth", authRouter());
  app.use("/api/users", usersRouter());
  app.use("/api/emails", emailsRouter());
  app.use("/api/gmail", gmailRouter());
  app.use("/api/folders", foldersRouter());
  app.use("/api/stats", statsRouter());
  app.use("/api/admin", adminRouter());
  app.use("/api/chat", chatRouter());
  app.use("/api/ai", aiRouter());
  app.use("/api/productivity", productivityRouter());
  app.use("/api", healthRouter);
}
