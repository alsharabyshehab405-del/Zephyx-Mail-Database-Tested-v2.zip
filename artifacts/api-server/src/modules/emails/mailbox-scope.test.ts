import { describe, expect, it } from "vitest";
import { assertMailboxScopeConfigured, normalizeMailboxScope, ORGANIZATION_MAILBOX_SCOPE_NOT_CONFIGURED } from "./mailbox-scope.js";

describe("mailbox scope guard", () => {
  it("normalizes blank scope to personal and allows it", () => {
    expect(normalizeMailboxScope(undefined)).toBe("personal");
    expect(normalizeMailboxScope("  ")).toBe("personal");
    expect(assertMailboxScopeConfigured(undefined)).toBe("personal");
    expect(assertMailboxScopeConfigured("personal")).toBe("personal");
  });

  it("does not silently expose a user mailbox for an organization scope", () => {
    expect(() => assertMailboxScopeConfigured("org-test")).toThrow(
      "Organization-scoped mailbox listing is not configured until emails have an organization mapping",
    );
    try {
      assertMailboxScopeConfigured("org-test");
    } catch (error) {
      expect(error).toMatchObject({ statusCode: 409, code: ORGANIZATION_MAILBOX_SCOPE_NOT_CONFIGURED });
    }
  });
});
