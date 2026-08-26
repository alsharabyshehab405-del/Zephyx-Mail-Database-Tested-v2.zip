import { meetingSuggestion } from "./meeting-parser.js";

describe("meeting suggestion extraction", () => {
  it("extracts an explicit date and time from a meeting email", () => {
    const result = meetingSuggestion({
      subject: "Project sync meeting",
      bodyText: "Let's meet on 2026-09-14 at 14:30.\nZoom link included.",
      fromEmail: "organizer@example.test",
    });

    expect(result?.detected).toBe(true);
    expect(result?.start).toContain("2026-09-14T14:30");
    expect(result?.end).toContain("2026-09-14T15:30");
  });

  it("does not classify ordinary mail as a meeting", () => {
    expect(meetingSuggestion({ subject: "Weekly update", bodyText: "Here is the report.", fromEmail: "news@example.test" })).toBeNull();
  });

  it("handles 12-hour clock boundaries without depending on server timezone", () => {
    const midnight = meetingSuggestion({
      subject: "Meeting invitation",
      bodyText: "Meet on 2026-09-14 at 12:00 am.",
      fromEmail: "organizer@example.test",
    });
    const noon = meetingSuggestion({
      subject: "Meeting invitation",
      bodyText: "Meet on 2026-09-14 at 12:00 pm.",
      fromEmail: "organizer@example.test",
    });

    expect(midnight?.start).toBe("2026-09-14T00:00:00.000Z");
    expect(noon?.start).toBe("2026-09-14T12:00:00.000Z");
  });
});
