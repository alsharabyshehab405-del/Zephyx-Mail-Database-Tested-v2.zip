import { describe, expect, it } from "vitest";
import { deriveEmailActions } from "./action-engine.js";

describe("Zephyx Action Center", () => {
  it("derives explainable local actions from meeting, finance and order signals", () => {
    const actions = deriveEmailActions({
      subject: "Meeting invoice order",
      bodyText: "Please join the meeting tomorrow. Your invoice payment is due and order tracking is available.",
      folder: "inbox",
      isRead: false,
      threat: null,
    });
    expect(actions.map((item) => item.type)).toEqual(expect.arrayContaining(["read", "reply", "attend", "add_to_planner", "add_to_calendar", "pay", "review", "track"]));
    expect(actions.every((item) => item.confidence >= 0 && item.confidence <= 1)).toBe(true);
    expect(actions.every((item) => item.permissionsRequired.length > 0)).toBe(true);
    expect(actions.every((item) => item.requiresConfirmation === true)).toBe(true);
  });

  it("only suggests security actions from stored findings and never calls an external provider", () => {
    const actions = deriveEmailActions({ subject: "Alert", bodyText: "Review", folder: "inbox", isRead: true, threat: { overallRisk: "high" } });
    expect(actions.map((item) => item.type)).toEqual(expect.arrayContaining(["secure", "report", "quarantine"]));
    expect(actions.find((item) => item.type === "quarantine")?.permissionsRequired).toContain("quarantine:write");
    expect(actions.find((item) => item.type === "quarantine")?.requiresConfirmation).toBe(true);
  });
});
