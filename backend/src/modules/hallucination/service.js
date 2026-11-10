import { HttpError } from "../../core/http.js";

const MAX_QUESTION = 4000;

/**
 * Labels one RAG answer. The model call and the grounding check stay in RAG.
 * This module only names the outcome.
 */
export function createHallucinationService({ ask, complete, labelFor }) {
  async function check(question, userId) {
    const text = cleanQuestion(question);
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

  async function judge(question, userId) {
    const text = cleanQuestion(question);
    if (typeof labelFor !== "function" || typeof complete !== "function") {
      throw new HttpError(400, "Judge is not configured");
    }
    const facts = labelFacts(await labelFor(text));
    if (facts.length === 0) throw new HttpError(400, "That question has no human label");

    const result = await ask(text, userId);
    const answer = result.answer ?? "";
    const reply = await complete(judgePrompt({ question: text, answer, expect: facts }));
    const modelSays = /^\s*yes\b/i.test(String(reply ?? ""));
    const labelSays = answerHasFacts(answer, facts);
    return { expect: facts.join(", "), answer, modelSays, labelSays, agree: modelSays === labelSays };
  }

  return { check, judge };
}

function cleanQuestion(question) {
  const text = typeof question === "string" ? question.trim() : "";
  if (!text) throw new HttpError(400, "Missing 'question'");
  if (text.length > MAX_QUESTION) {
    throw new HttpError(400, `Question must be at most ${MAX_QUESTION} characters`);
  }
  return text;
}

/** A label is one fact or a list of facts. Empty entries are ignored. */
export function labelFacts(expect) {
  const list = Array.isArray(expect) ? expect : [expect];
  return list.map((fact) => String(fact ?? "").trim()).filter(Boolean);
}

/** The cheap check: every labelled fact appears in the answer, ignoring case. */
export function answerHasFacts(answer, expect) {
  const text = String(answer ?? "").toLowerCase();
  const facts = labelFacts(expect);
  return facts.length > 0 && facts.every((fact) => text.includes(fact.toLowerCase()));
}

export function judgePrompt({ question, answer, expect }) {
  const facts = labelFacts(expect);
  const many = facts.length > 1;
  return [
    `A human labeled this question. The answer is supposed to include the ${many ? "facts" : "fact"} below.`,
    `Question: ${question}`,
    many ? `Facts: ${facts.join("; ")}` : `Fact: ${facts[0] ?? ""}`,
    `Answer: ${answer}`,
    `Reply with yes if the answer includes ${many ? "every one of those facts" : "that fact"}. Reply with no if it does not. One word.`,
  ].join("\n");
}
