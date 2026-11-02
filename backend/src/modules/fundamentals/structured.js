export const SENTIMENTS = ["positive", "negative", "mixed"];

export const JSON_SYSTEM = `Reply with only a JSON object, no markdown and no explanation.
Use exactly this shape:
{"sentiment":"positive" | "negative" | "mixed","nextStep":"one sentence"}`;

/**
 * Pulls a JSON object out of a model reply and checks the support-ticket shape.
 * Models often wrap JSON in prose or a ```json fence, so the parser looks for the
 * first { and the last } instead of requiring the whole reply to be JSON.
 */
/** First balanced `{...}` that is also valid JSON. Extra trailing braces are ignored. */
function firstJsonObject(text) {
  for (let start = text.indexOf("{"); start !== -1; start = text.indexOf("{", start + 1)) {
    const slice = balancedObject(text, start);
    if (!slice) continue;
    try {
      const value = JSON.parse(slice);
      if (value && typeof value === "object" && !Array.isArray(value)) return value;
    } catch {
      // This brace started prose or a broken object. Try the next one.
    }
  }
  return null;
}

function balancedObject(text, start) {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export function parseSupportJson(text) {
  const raw = String(text ?? "").trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : raw).trim();
  const value = firstJsonObject(candidate);
  if (!value) {
    return { ok: false, error: candidate.includes("{") ? "Invalid JSON object" : "No JSON object found" };
  }

  const sentiment = typeof value.sentiment === "string" ? value.sentiment.trim().toLowerCase() : "";
  const nextStep = typeof value.nextStep === "string" ? value.nextStep.trim() : "";

  if (!SENTIMENTS.includes(sentiment)) {
    return { ok: false, error: "sentiment must be positive, negative, or mixed" };
  }
  if (!nextStep) {
    return { ok: false, error: "nextStep must be a non-empty string" };
  }

  return { ok: true, data: { sentiment, nextStep } };
}

export function correctionMessage(error) {
  return `That reply was not valid. Error: ${error}. Reply with only the JSON object.`;
}
