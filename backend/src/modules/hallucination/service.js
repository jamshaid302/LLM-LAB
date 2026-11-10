import { HttpError } from "../../core/http.js";

const MAX_QUESTION = 4000;

/**
 * Labels one RAG answer. The model call and the grounding check stay in RAG.
 * This module only names the outcome.
 */
export function createHallucinationService({ ask }) {
  async function check(question, userId) {
    const text = typeof question === "string" ? question.trim() : "";
    if (!text) throw new HttpError(400, "Missing 'question'");
    if (text.length > MAX_QUESTION) {
      throw new HttpError(400, `Question must be at most ${MAX_QUESTION} characters`);
    }

    const result = await ask(text, userId);
    const sources = (result.matchedSources ?? []).map((hit) => ({
      source: hit.source ?? null,
      score: hit.score ?? null,
    }));
    let verdict = "grounded";
    if (result.refused && sources.length === 0) verdict = "search missed";
    else if (result.refused) verdict = "replaced";

    return { verdict, answer: result.answer, sources };
  }

  return { check };
}
