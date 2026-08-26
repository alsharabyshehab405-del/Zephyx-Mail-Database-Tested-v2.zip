export type MeetingSuggestion = {
  detected: true;
  title: string;
  start: string | null;
  end: string | null;
  attendees: string[];
};

export function meetingSuggestion(email: { subject: string; bodyText: string; fromEmail: string }): MeetingSuggestion | null {
  const text = `${email.subject}\n${email.bodyText}`;
  if (!/(meeting|calendar|invite|invitation|zoom|teams|webex|agenda|call)/i.test(text)) return null;
  const dateMatch = text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  const timeMatch = text.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/i);
  if (!dateMatch) return { detected: true, title: email.subject || "Meeting", start: null, end: null, attendees: [email.fromEmail] };
  const rawHour = Number(timeMatch?.[1] ?? 9);
  const minute = Number(timeMatch?.[2] ?? 0);
  const meridiem = timeMatch?.[3]?.toLowerCase();
  const hour = meridiem === "am"
    ? rawHour % 12
    : meridiem === "pm"
      ? (rawHour % 12) + 12
      : rawHour;

  if (hour > 23 || minute > 59 || (meridiem && (rawHour < 1 || rawHour > 12))) {
    return { detected: true, title: email.subject || "Meeting", start: null, end: null, attendees: [email.fromEmail] };
  }

  // Treat an unqualified date/time as UTC so server locale cannot silently
  // shift meetings when the same email is processed in another region.
  const start = new Date(Date.UTC(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]), hour, minute));
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { detected: true, title: email.subject || "Meeting", start: start.toISOString(), end: end.toISOString(), attendees: [email.fromEmail] };
}
