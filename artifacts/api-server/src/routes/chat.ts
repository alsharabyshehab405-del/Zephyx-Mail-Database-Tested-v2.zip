import express, { Router } from "express";
import { logger } from "../lib/logger.js";
import { requireAuth } from "../middlewares/auth.js";
import { createAuthRateLimit } from "../middlewares/rate-limit.js";

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  error?: {
    message?: string;
    status?: string;
  };
};

const chatRateLimit = createAuthRateLimit({
  max: 30,
  windowMs: 10 * 60 * 1000,
});

export function chatRouter() {
  const router = Router();

  router.use(express.json());

  router.post("/", chatRateLimit, requireAuth, async (req, res) => {
    try {
      const message = req.body?.message ?? req.body?.prompt ?? req.query?.message;

      if (typeof message !== "string" || message.trim() === "") {
        return res.status(400).json({
          error: "يجب إرسال message كنص غير فارغ",
        });
      }

      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey) {
        logger.error("Chat service is not configured");
        return res.status(503).json({
          error: "Chat service is temporarily unavailable",
        });
      }

      const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: message.trim(),
                  },
                ],
              },
            ],
          }),
        },
      );

      const data = (await response.json()) as GeminiResponse;

      if (!response.ok) {
        logger.warn(
          {
            upstreamStatusCode: response.status,
            upstreamErrorStatus: data.error?.status,
          },
          "Gemini request failed",
        );

        return res.status(502).json({
          error: "Chat service is temporarily unavailable",
        });
      }

      const reply =
        data.candidates?.[0]?.content?.parts
          ?.map((part) => part.text ?? "")
          .join("")
          .trim() ?? "";

      if (!reply) {
        return res.status(502).json({
          error: "Gemini لم يرجع ردًا نصيًا",
        });
      }

      return res.status(200).json({
        reply,
      });
    } catch (error) {
      logger.error({ err: error }, "NovaMail chat request failed");

      return res.status(500).json({
        error: "Internal server error",
      });
    }
  });

  return router;
}
