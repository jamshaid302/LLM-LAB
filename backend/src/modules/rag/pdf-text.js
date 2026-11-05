import { extractText } from "unpdf";

/** Plain text from a PDF buffer. A scanned page with no text layer comes back empty. */
export async function extractPdfText(bytes) {
  // unpdf rejects a Node Buffer even though Buffer is a Uint8Array. Copy into a plain one.
  const data = new Uint8Array(bytes.byteLength);
  data.set(bytes);
  const { text } = await extractText(data, { mergePages: true });
  return typeof text === "string" ? text.trim() : "";
}
