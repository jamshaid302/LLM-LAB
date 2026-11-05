import { NO_ANSWER } from "./prompt.js";

const CITATION = /\[\d+\]/g;
const CODE = /\b[\p{L}\p{N}_-]*\d[\p{L}\p{N}_-]*\b/gu;
const NAME = /\b[A-Z][a-z]+(?:-[A-Z][a-z]+)*\b/g;

/** Sentence starters. A capitalized word outside this list is treated as a name. */
const ORDINARY = new Set([
  "The",
  "A",
  "An",
  "I",
  "It",
  "This",
  "That",
  "These",
  "Those",
  "Based",
  "According",
  "If",
  "When",
  "Where",
  "What",
  "Who",
  "How",
  "Yes",
  "No",
  "There",
]);

/**
 * Keep an answer only when it says something, and every name or code it uses
 * appears in the retrieved text. A reply that is only "[1]" is not an answer.
 * A fact that is written in the file still counts as supported.
 */
export function groundAnswer(answer, chunks) {
  const text = String(answer ?? "").trim();
  if (!text || text === NO_ANSWER) {
    return { grounded: text === NO_ANSWER, answer: NO_ANSWER };
  }

  const prose = text.replace(CITATION, " ").replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim();
  if (!prose) return { grounded: false, answer: NO_ANSWER };

  const corpus = (chunks ?? [])
    .map((chunk) => chunk.text ?? chunk.pageContent ?? "")
    .join("\n")
    .toLowerCase();

  const claims = new Set();
  for (const match of text.matchAll(CODE)) claims.add(match[0]);
  for (const match of text.matchAll(NAME)) {
    if (!ORDINARY.has(match[0])) claims.add(match[0]);
  }

  for (const claim of claims) {
    if (!corpus.includes(claim.toLowerCase())) {
      return { grounded: false, answer: NO_ANSWER };
    }
  }

  return { grounded: true, answer: text };
}
