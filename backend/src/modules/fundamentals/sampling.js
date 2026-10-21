import { HttpError } from "../../core/http.js";

/**
 * The usual rule of thumb: about 4 characters per token. It is systematically wrong
 * for code, numbers, and non-English text. The playground shows it beside the model's
 * real count so the error is visible instead of trusted.
 */
export function estimateTokens(text) {
  return Math.ceil(String(text).length / 4);
}

function readNumber(value, name, { min, max, fallback }) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new HttpError(400, `${name} must be a number between ${min} and ${max}`);
  }
  return parsed;
}

function readIntInRange(value, name, { min, max, fallback }) {
  const parsed = readNumber(value, name, { min, max, fallback });
  if (!Number.isInteger(parsed)) {
    throw new HttpError(400, `${name} must be a whole number`);
  }
  return parsed;
}

/** Turns a request body into sampling settings, or throws a 400 HttpError. */
export function parseSampling(body = {}) {
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) throw new HttpError(400, "Missing 'prompt'");
  if (prompt.length > 4000) throw new HttpError(400, "Prompt must be at most 4000 characters");

  const system = typeof body.system === "string" ? body.system.trim() : "";

  const settings = {
    prompt,
    temperature: readNumber(body.temperature, "temperature", { min: 0, max: 2, fallback: 0 }),
    topP: readNumber(body.topP, "topP", { min: 0, max: 1, fallback: 0.9 }),
    maxTokens: readIntInRange(body.maxTokens, "maxTokens", { min: 1, max: 512, fallback: 128 }),
  };

  if (system) settings.system = system;

  if (body.seed !== undefined && body.seed !== null && body.seed !== "") {
    settings.seed = readIntInRange(body.seed, "seed", { min: 0, max: 2_147_483_647, fallback: 0 });
  }

  return settings;
}
