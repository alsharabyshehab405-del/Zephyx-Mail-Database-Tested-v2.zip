import { describe, expect, it } from "vitest";
import { extractUnsubscribe } from "./unsubscribe-extractor.js";

describe("unsubscribe extraction", () => {
  it("finds manual links but does not claim List-Unsubscribe support", () => {
    const result = extractUnsubscribe({ id: "email-1", subject: "Newsletter", bodyText: "Manage preferences: https://example.invalid/unsubscribe?id=123", bodyHtml: "", fromEmail: "news@example.invalid" });
    expect(result.manualLinks).toEqual(["https://example.invalid/unsubscribe?id=123"]);
    expect(result.listUnsubscribe).toEqual([]);
    expect(result.state).toBe("MANUAL_LINKS_FOUND");
    expect(result.providerState).toBe("NOT_CONFIGURED");
  });
});
