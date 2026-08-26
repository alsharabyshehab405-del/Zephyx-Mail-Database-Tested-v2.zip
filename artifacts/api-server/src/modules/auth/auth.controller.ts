import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import { z } from "zod";
import { requireAuth, type AuthenticatedRequest } from "../../middlewares/auth.js";
import {
  authRateLimit,
  emailActionRateLimit,
  passwordResetRateLimit,
} from "../../middlewares/rate-limit.js";
import { logger } from "../../lib/logger.js";
import {
  registerUser,
  loginUser,
  completeTwoFactorLogin,
  refreshTokens,
  revokeRefreshToken,
  getSessions,
  revokeSession,
  revokeAllSessions,
  requestEmailVerificationForUser,
  confirmEmailVerification,
  requestPasswordReset,
  resetPassword,
} from "./auth.service.js";
import {
  beginTwoFactorSetup,
  disableTwoFactor,
  enableTwoFactor,
  getTwoFactorStatus,
  regenerateRecoveryCodes,
} from "./two-factor.service.js";

const RegisterSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(256),
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
});

const LoginSchema = z.object({
  email: z.string().min(1, "Email is required").max(255),
  password: z.string().min(1, "Password is required").max(256),
});

const TwoFactorCodeSchema = z.string().trim().min(6, "Verification code is required").max(64);

const TwoFactorLoginSchema = z.object({
  challengeToken: z.string().min(20, "Challenge token is required").max(256),
  code: TwoFactorCodeSchema,
});

const TwoFactorSetupSchema = z.object({
  password: z.string().min(1, "Password is required").max(256),
});

const TwoFactorEnableSchema = z.object({ code: TwoFactorCodeSchema });

const TwoFactorDisableSchema = z.object({
  password: z.string().min(1, "Password is required").max(256),
  code: TwoFactorCodeSchema,
});

const RefreshSchema = z.object({
  refreshToken: z.string().min(1, "refreshToken is required").max(4096),
});

const LogoutSchema = z.object({
  refreshToken: z.string().min(1).max(4096).optional(),
});

const ForgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address").max(255),
});

const ResetPasswordSchema = z.object({
  token: z.string().min(1, "Token is required").max(256),
  newPassword: z.string().min(8, "Password must be at least 8 characters").max(256),
});

const VerifyEmailSchema = z.object({
  token: z.string().min(1, "Token is required").max(256),
});

const SessionIdSchema = z.string().uuid("Invalid session id");

const RevokeAllSchema = z.object({
  keepCurrentSession: z.boolean().optional().default(false),
});

function sessionContext(req: Request) {
  return {
    userAgent: req.headers["user-agent"] ?? null,
    ip: req.ip ?? req.socket?.remoteAddress ?? null,
  };
}

function validationError(res: Response, parsed: { error: z.ZodError }): void {
  res.status(400).json({
    error: parsed.error.issues.map((issue) => issue.message).join("; "),
  });
}

function sendError(res: Response, err: unknown): void {
  const error = err as Error & { statusCode?: number };
  const status = error.statusCode ?? 500;
  if (status >= 500) {
    logger.error({ err: error }, "Authentication request failed");
  }
  res.status(status).json({ error: status >= 500 ? "Internal server error" : error.message });
}

export function authRouter(): Router {
  const router = createRouter();

  router.post("/register", authRateLimit, async (req, res) => {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed);
    try {
      res.status(201).json(await registerUser(parsed.data, sessionContext(req)));
    } catch (err: unknown) {
      sendError(res, err);
    }
  });

  router.post("/login", authRateLimit, async (req, res) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed);
    try {
      res.json(await loginUser(parsed.data, sessionContext(req)));
    } catch (err: unknown) {
      sendError(res, err);
    }
  });

  router.post("/2fa/login/verify", authRateLimit, async (req, res) => {
    const parsed = TwoFactorLoginSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed);
    try {
      res.json(
        await completeTwoFactorLogin(
          parsed.data.challengeToken,
          parsed.data.code,
          sessionContext(req),
        ),
      );
    } catch (err: unknown) {
      sendError(res, err);
    }
  });

  router.get("/2fa/status", requireAuth, async (req, res) => {
    const user = (req as AuthenticatedRequest).user;
    try {
      res.json(await getTwoFactorStatus(user.sub));
    } catch (err: unknown) {
      sendError(res, err);
    }
  });

  router.post("/2fa/setup", authRateLimit, requireAuth, async (req, res) => {
    const parsed = TwoFactorSetupSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed);
    const user = (req as AuthenticatedRequest).user;
    try {
      res.json(await beginTwoFactorSetup(user.sub, parsed.data.password));
    } catch (err: unknown) {
      sendError(res, err);
    }
  });

  router.post("/2fa/enable", authRateLimit, requireAuth, async (req, res) => {
    const parsed = TwoFactorEnableSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed);
    const user = (req as AuthenticatedRequest).user;
    try {
      res.json(await enableTwoFactor(user.sub, parsed.data.code, user.sid));
    } catch (err: unknown) {
      sendError(res, err);
    }
  });

  router.post("/2fa/disable", authRateLimit, requireAuth, async (req, res) => {
    const parsed = TwoFactorDisableSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed);
    const user = (req as AuthenticatedRequest).user;
    try {
      res.json(
        await disableTwoFactor(user.sub, parsed.data.password, parsed.data.code, user.sid),
      );
    } catch (err: unknown) {
      sendError(res, err);
    }
  });

  router.post("/2fa/recovery/regenerate", authRateLimit, requireAuth, async (req, res) => {
    const parsed = TwoFactorDisableSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed);
    const user = (req as AuthenticatedRequest).user;
    try {
      res.json(await regenerateRecoveryCodes(user.sub, parsed.data.password, parsed.data.code));
    } catch (err: unknown) {
      sendError(res, err);
    }
  });

  router.post("/refresh", authRateLimit, async (req, res) => {
    const parsed = RefreshSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed);
    try {
      res.json(await refreshTokens(parsed.data.refreshToken, sessionContext(req)));
    } catch (err: unknown) {
      sendError(res, err);
    }
  });

  router.post("/logout", requireAuth, async (req, res) => {
    const parsed = LogoutSchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(res, parsed);
    const user = (req as AuthenticatedRequest).user;
    try {
      if (parsed.data.refreshToken) {
        await revokeRefreshToken(user.sub, parsed.data.refreshToken);
      } else if (user.sid) {
        await revokeSession(user.sub, user.sid);
      }
      res.status(204).end();
    } catch (err: unknown) {
      sendError(res, err);
    }
  });

  router.post("/password/forgot", emailActionRateLimit, async (req, res) => {
    const parsed = ForgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed);
    try {
      // Intentionally always returns the same success response for valid email syntax.
      res.json(await requestPasswordReset(parsed.data.email));
    } catch (err: unknown) {
      sendError(res, err);
    }
  });

  router.post("/password/reset", passwordResetRateLimit, async (req, res) => {
    const parsed = ResetPasswordSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed);
    try {
      await resetPassword(parsed.data.token, parsed.data.newPassword);
      res.json({ message: "Password has been reset successfully." });
    } catch (err: unknown) {
      sendError(res, err);
    }
  });

  router.post(
    "/email-verification/request",
    requireAuth,
  emailActionRateLimit,
    async (req, res) => {
      const user = (req as AuthenticatedRequest).user;
      try {
        await requestEmailVerificationForUser(user.sub);
        res.json({ message: "Verification request accepted." });
      } catch (err: unknown) {
        sendError(res, err);
      }
    },
  );

  router.post("/email-verification/confirm", passwordResetRateLimit, async (req, res) => {
    const parsed = VerifyEmailSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed);
    try {
      await confirmEmailVerification(parsed.data.token);
      res.json({ message: "Email verified successfully." });
    } catch (err: unknown) {
      sendError(res, err);
    }
  });

  router.get("/sessions", requireAuth, async (req, res) => {
    const user = (req as AuthenticatedRequest).user;
    try {
      res.json({ sessions: await getSessions(user.sub, user.sid) });
    } catch (err: unknown) {
      sendError(res, err);
    }
  });

  router.delete("/sessions/:sessionId", requireAuth, async (req, res) => {
    const user = (req as AuthenticatedRequest).user;
    const parsed = SessionIdSchema.safeParse(req.params["sessionId"]);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid session id" });
      return;
    }
    try {
      await revokeSession(user.sub, parsed.data);
      res.status(204).end();
    } catch (err: unknown) {
      sendError(res, err);
    }
  });

  router.post("/sessions/revoke-all", requireAuth, async (req, res) => {
    const user = (req as AuthenticatedRequest).user;
    const parsed = RevokeAllSchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(res, parsed);
    try {
      const keepId = parsed.data.keepCurrentSession ? user.sid : undefined;
      const result = await revokeAllSessions(user.sub, keepId);
      res.json({
        message: keepId
          ? "All other sessions have been revoked."
          : "All sessions have been revoked.",
        revokedCount: result.count,
      });
    } catch (err: unknown) {
      sendError(res, err);
    }
  });

  return router;
}
