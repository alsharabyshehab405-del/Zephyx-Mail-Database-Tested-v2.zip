import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../../middlewares/auth.js";
import { createAuthRateLimit } from "../../middlewares/rate-limit.js";
import {
  categorizeEmail,
  extractProductivityInsights,
  generateEmailDraft,
  summarizeEmailThread,
  type AiWriteOperation,
  type SummaryMode,
} from "./ai.service.js";

const aiRateLimit = createAuthRateLimit({ max: 40, windowMs: 10 * 60 * 1000 });
const validOperations = new Set<AiWriteOperation>(["draft", "rephrase", "shorten", "expand", "professional", "friendly", "formal", "casual", "polite", "direct", "grammar", "translate", "subject", "quick_reply"]);

function errorStatus(error: unknown): number {
  const status = (error as { statusCode?: number }).statusCode;
  return typeof status === "number" ? status : 500;
}

export function aiRouter(): Router {
  const router = Router();
  router.use(requireAuth, aiRateLimit);

  router.post("/write", async (req, res) => {
    try {
      const user = (req as unknown as AuthenticatedRequest).user;
      const operation = req.body?.operation as AiWriteOperation;
      if (!validOperations.has(operation)) return res.status(400).json({ error: "Invalid AI write operation" });
      const result = await generateEmailDraft({
        operation,
        instruction: req.body?.instruction,
        context: req.body?.context,
        threadText: req.body?.threadText,
        scopeKey: `user:${user.sub}`,
        consentGranted: req.body?.consentGranted === true,
      });
      return res.json(result);
    } catch (error: unknown) {
      return res.status(errorStatus(error)).json({ error: errorStatus(error) >= 500 ? "AI service unavailable" : (error as Error).message });
    }
  });

  router.post("/summary/:emailId", async (req, res) => {
    try {
      const user = (req as unknown as AuthenticatedRequest).user;
      const requestedMode = req.body?.mode as SummaryMode | undefined;
      const mode: SummaryMode = requestedMode === "detailed" || requestedMode === "key_points" || requestedMode === "action_items" ? requestedMode : "short";
      const persist = req.body?.persist === true;
      const result = await summarizeEmailThread(user.sub, req.params.emailId as string, mode, persist, req.body?.consentGranted === true);
      return res.json(result);
    } catch (error: unknown) {
      return res.status(errorStatus(error)).json({ error: errorStatus(error) >= 500 ? "AI service unavailable" : (error as Error).message });
    }
  });

  router.post("/insights/:emailId", async (req, res) => {
    try {
      const user = (req as unknown as AuthenticatedRequest).user;
      const result = await extractProductivityInsights(user.sub, req.params.emailId as string, req.body?.consentGranted === true);
      return res.json(result);
    } catch (error: unknown) {
      return res.status(errorStatus(error)).json({ error: errorStatus(error) >= 500 ? "AI service unavailable" : (error as Error).message });
    }
  });

  router.post("/categorize/:emailId", async (req, res) => {
    try {
      const user = (req as unknown as AuthenticatedRequest).user;
      const organizationId = req.get("x-organization-id")?.trim() || undefined;
      const result = await categorizeEmail(user.sub, req.params.emailId as string, organizationId);
      return res.json(result);
    } catch (error: unknown) {
      return res.status(errorStatus(error)).json({ error: errorStatus(error) >= 500 ? "AI service unavailable" : (error as Error).message });
    }
  });

  return router;
}
