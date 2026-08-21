import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../../middlewares/auth.js";
import { createAuthRateLimit } from "../../middlewares/rate-limit.js";
import {
  categorizeEmail,
  generateEmailDraft,
  summarizeEmailThread,
  type AiWriteOperation,
} from "./ai.service.js";

const aiRateLimit = createAuthRateLimit({ max: 40, windowMs: 10 * 60 * 1000 });
const validOperations = new Set<AiWriteOperation>(["draft", "rephrase", "shorten", "quick_reply"]);

function errorStatus(error: unknown): number {
  const status = (error as { statusCode?: number }).statusCode;
  return typeof status === "number" ? status : 500;
}

export function aiRouter(): Router {
  const router = Router();
  router.use(requireAuth, aiRateLimit);

  router.post("/write", async (req, res) => {
    try {
      const operation = req.body?.operation as AiWriteOperation;
      if (!validOperations.has(operation)) return res.status(400).json({ error: "Invalid AI write operation" });
      const result = await generateEmailDraft({
        operation,
        instruction: req.body?.instruction,
        context: req.body?.context,
        threadText: req.body?.threadText,
      });
      return res.json({ text: result, operation });
    } catch (error: unknown) {
      return res.status(errorStatus(error)).json({ error: errorStatus(error) >= 500 ? "AI service unavailable" : (error as Error).message });
    }
  });

  router.post("/summary/:emailId", async (req, res) => {
    try {
      const user = (req as unknown as AuthenticatedRequest).user;
      const summary = await summarizeEmailThread(user.sub, req.params.emailId as string);
      return res.json({ summary });
    } catch (error: unknown) {
      return res.status(errorStatus(error)).json({ error: errorStatus(error) >= 500 ? "AI service unavailable" : (error as Error).message });
    }
  });

  router.post("/categorize/:emailId", async (req, res) => {
    try {
      const user = (req as unknown as AuthenticatedRequest).user;
      const result = await categorizeEmail(user.sub, req.params.emailId as string);
      return res.json(result);
    } catch (error: unknown) {
      return res.status(errorStatus(error)).json({ error: errorStatus(error) >= 500 ? "AI service unavailable" : (error as Error).message });
    }
  });

  return router;
}
