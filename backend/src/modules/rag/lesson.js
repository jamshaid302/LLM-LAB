import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const GUIDE_PATH = fileURLToPath(new URL("./docs/learning-guide.md", import.meta.url));

const STOP = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "to",
  "in",
  "on",
  "for",
  "with",
  "how",
  "what",
  "are",
  "is",
  "does",
  "do",
  "can",
  "i",
  "they",
  "their",
  "this",
  "that",
  "about",
  "into",
  "from",
  "your",
  "you",
]);

/** Words that identify a lesson, with llm/llms treated as the same word. */
function contentWords(text) {
  const words = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP.has(word))
    .map((word) => (word.startsWith("llm") ? "llm" : word));
  return new Set(words);
}

/** The question in the lesson body. The markdown heading is a shorter copy of it. */
function lessonQuestion(text) {
  const body = String(text).replace(/^#+\s+[^\n]+\n+/, "").replace(/\s+/g, " ").trim();
  const match = body.match(/^([^?]+\?)/);
  return match?.[1] ?? "";
}

let guideQuestions = null;

/** The question that opens each lesson, read from the guide. */
function lessonQuestions() {
  if (guideQuestions) return guideQuestions;
  const text = readFileSync(GUIDE_PATH, "utf8");
  guideQuestions = [...text.matchAll(/^(?!#)([^?\n]+\?)/gm)].map((match) => match[1]);
  return guideQuestions;
}

/**
 * How much of the learner's question is in a lesson question, and how little
 * extra that lesson question adds. A half match is not enough.
 */
function matchScore(question, lesson) {
  const asked = contentWords(question);
  const lessonWords = contentWords(lesson);
  if (asked.size === 0 || lessonWords.size === 0) return 0;
  let shared = 0;
  for (const word of asked) if (lessonWords.has(word)) shared += 1;
  const coverage = shared / asked.size;
  if (coverage <= 0.5) return 0;
  const union = new Set([...asked, ...lessonWords]).size;
  return shared / union;
}

/** The explanation after that question, without the markdown heading. */
function lessonBody(text) {
  const flat = String(text).replace(/\r\n/g, "\n").trim();
  const withoutHeading = flat.replace(/^#+\s+[^\n]+\n+/, "");
  // Overlap keeps the next lesson's heading on the end of this chunk.
  const cut = withoutHeading.split(/\n#+\s+/)[0];
  const body = cut.replace(/^[^?\n]+\?\s*/, "").trim();
  return body || cut.trim();
}

/**
 * The stored lesson when a retrieved learning-guide chunk is the question the
 * learner asked. A small model paraphrases these lessons into steps the guide
 * does not state, so the chunk itself is the answer.
 */
/**
 * True when the message is already one of the guide's questions, so a follow-up
 * rewrite must not replace it with a different search.
 */
export function searchAsWritten(question) {
  return lessonQuestions().some((lesson) => matchScore(question, lesson) > 0);
}

export function lessonReply(question, hits) {
  let best = null;
  let bestScore = 0;
  for (const hit of hits ?? []) {
    if (hit?.source !== "learning-guide.md") continue;
    const score = matchScore(question, lessonQuestion(hit.text));
    if (score > bestScore) {
      bestScore = score;
      best = hit;
    }
  }

  if (!best) return null;
  const body = lessonBody(best.text);
  return body || null;
}
