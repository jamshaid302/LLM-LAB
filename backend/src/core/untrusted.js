/** Put retrieved text in a tag the rules can point at. A chunk cannot close that tag early. */
export function fenceUntrusted(text, { source = "unknown", id = 1 } = {}) {
  const body = String(text ?? "").replaceAll("</document>", "<\\/document>");
  const label = String(source).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  return `<document source="${label}" id="${id}">\n${body}\n</document>`;
}
