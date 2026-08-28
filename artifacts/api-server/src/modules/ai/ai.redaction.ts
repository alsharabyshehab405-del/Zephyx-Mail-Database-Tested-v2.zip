export function redactAiText(value: string, maxLength = 40_000): string {
  return value
    .replace(/\u0000/g, "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[redacted-number]")
    .replace(/\b(?:\+?\d[\d .()\-]{7,}\d)\b/g, "[redacted-phone]")
    .replace(/(password|passwd|passcode|otp|secret|api[- ]?key)\s*[:=]\s*\S+/gi, "$1: [redacted]")
    .slice(0, maxLength);
}
