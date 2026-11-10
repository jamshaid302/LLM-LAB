const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;
const PHONE = /\b(?:\+\d{1,3}[\s-]?)?(?:\(\d{3}\)|\d{3})[\s-]\d{3}[\s-]\d{4}\b/g;
const CARD = /\b(?:\d[ -]*?){13,19}\b/g;
const KEY = /\b(?:sk|rk|pk|api)[_-][A-Za-z0-9]{10,}\b/g;

/** Hide contact details and secrets. Short codes such as lantern-42 stay. */
export function redactOutput(text) {
  return String(text ?? "")
    .replace(EMAIL, "[redacted email]")
    .replace(SSN, "[redacted id]")
    .replace(PHONE, "[redacted phone]")
    .replace(KEY, "[redacted key]")
    .replace(CARD, (match) => (match.replace(/\D/g, "").length >= 13 ? "[redacted card]" : match));
}
