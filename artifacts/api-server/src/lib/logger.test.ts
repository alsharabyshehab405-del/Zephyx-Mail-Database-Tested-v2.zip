import { describe, expect, it } from "vitest";
import { LOGGER_REDACT_PATHS } from "./logger.js";

describe("structured logger redaction contract", () => {
  it("redacts message content, attachment payloads, credentials and provider prompts", () => {
    expect(LOGGER_REDACT_PATHS).toEqual(expect.arrayContaining([
      "req.body",
      "res.body",
      "bodyText",
      "bodyHtml",
      "subject",
      "fromEmail",
      "toEmail",
      "attachments",
      "contentsBase64",
      "prompt",
      "context",
      "req.headers.authorization",
      "token",
    ]));
  });
});
