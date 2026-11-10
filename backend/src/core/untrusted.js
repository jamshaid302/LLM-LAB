/** Put retrieved text in a tag the rules can point at. A chunk cannot close that tag early. */
export function fenceUntrusted(text, { source = "unknown", id = 1 } = {}) {
  const body = String(text ?? "").replaceAll("</document>", "<\\/document>");
  const label = String(source).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  return `<document source="${label}" id="${id}">\n${body}\n</document>`;
}

const FENCE_TAG = /<\\?\/?document\b[^>]*>/gi;

/** Small models sometimes copy the fence tags into the reply. The person should not see them. */
export function stripFenceMarkup(answer) {
  return String(answer ?? "")
    .replace(FENCE_TAG, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
