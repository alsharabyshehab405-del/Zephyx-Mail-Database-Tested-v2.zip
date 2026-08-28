import { describe, expect, it } from "vitest";
import { derivePriority } from "./priority-engine.js";

describe("local priority engine", () => {
  it("raises urgent starred security mail", () => {
    const result = derivePriority({ subject: "Urgent action required", bodyText: "Deadline due today", category: "security", isStarred: true, isRead: false, folder: "inbox", threat: { overallRisk: "high" } });
    expect(result.priority).toBe("high");
    expect(result.reasons.length).toBeGreaterThan(1);
    expect(result.providerState).toBe("NOT_CONFIGURED");
  });

  it("does not promote promotional mail without stronger signals", () => {
    const result = derivePriority({ subject: "Sale", bodyText: "New offers", category: "promotions", isStarred: false, isRead: true, folder: "inbox" });
    expect(result.priority).toBe("low");
    expect(result.reasons).toContain("Lower priority category: promotions");
  });
});
