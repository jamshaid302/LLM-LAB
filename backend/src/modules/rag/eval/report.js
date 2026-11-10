import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "../../../core/config.js";
import { createCrossEncoder, rerankWithCrossEncoder } from "../../../core/cross-encoder.js";
import { NO_ANSWER } from "../prompt.js";
import { expectedPhrases } from "../retrieval.js";

export const BASELINE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "baseline.json");

export async function readBaseline(file = BASELINE_PATH) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (err) {
    if (err?.code === "ENOENT") return {};
    throw err;
  }
}

export async function writeBaseline(baseline, file = BASELINE_PATH) {
  await fs.writeFile(file, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
}

/** The same reranker the API uses, so a live score measures what users get. */
export function liveReranker() {
  if (config.rerank.mode !== "cross-encoder") return { rerank: null };
  const encoder = createCrossEncoder();
  return {
    rerank: (question, hits) => rerankWithCrossEncoder(hits, question, encoder),
    rerankCandidates: config.rerank.candidates,
  };
}

export function today(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

const round = (value) => (typeof value === "number" ? Math.round(value * 1000) / 1000 : value);

/**
 * The retrieval part of baseline.json. `chunks` is what the store holds for the shared
 * corpus. A multi-phrase question "spans chunks" when no single chunk holds every phrase.
 */
export function retrievalSummary(report, { chunks, suite, embedModel, measured = today() }) {
  const multi = (suite.answerable ?? []).filter((item) => Array.isArray(item.expect));
  const spanning = multi.filter((item) => {
    const phrases = expectedPhrases(item.expect);
    return !chunks.some((chunk) => phrases.every((phrase) => String(chunk.text).toLowerCase().includes(phrase)));
  });
  const topScores = report.details.map((row) => row.topScore).filter((score) => typeof score === "number");

  return {
    measured,
    embedModel,
    k: report.k,
    minScore: report.minScore,
    files: [...new Set(chunks.map((chunk) => chunk.source))].sort(),
    chunks: chunks.length,
    questions: {
      answerable: report.answerable,
      multiChunk: multi.length,
      multiChunkSpanning: spanning.length,
      unanswerable: report.unanswerable,
    },
    recallAtK: { before: round(report.recallAtK.before), after: round(report.recallAtK.after) },
    mrr: { before: round(report.mrr.before), after: round(report.mrr.after) },
    unanswerable: report.unanswerable,
    refusedByCutoff: report.refusedByCutoff,
    lowestAnswerableTopScore: topScores.length ? round(Math.min(...topScores)) : null,
    missed: report.details
      .filter((row) => !row.foundAfter)
      .map((row) => ({ question: row.question, topScore: round(row.topScore), foundBeforeCutoff: row.foundBefore })),
    notRefused: report.unanswerableDetails
      .filter((row) => !row.refused)
      .map((row) => ({ question: row.question, topScore: round(row.topScore) })),
  };
}

/** Metrics that fell compared with the committed file. An empty list means no drop. */
export function retrievalDrops(current, baseline) {
  const drops = [];
  const check = (name, now, before) => {
    if (typeof before === "number" && typeof now === "number" && now < before - 1e-9) {
      drops.push(`${name} fell from ${before} to ${now}`);
    }
  };
  check("recall@k after cutoff", current.recallAtK?.after, baseline.recallAtK?.after);
  check("MRR after cutoff", current.mrr?.after, baseline.mrr?.after);
  check("unanswerable refused by cutoff", current.refusedByCutoff, baseline.refusedByCutoff);
  return drops;
}

export function isRefusal(answer) {
  return String(answer ?? "").trim() === NO_ANSWER;
}

/** One answerable question after the RAG answer and the judge reply. */
export function answerableRow({ question, facts, result, judgeReply, labelSays, ms }) {
  const modelSays = /^\s*yes\b/i.test(String(judgeReply ?? ""));
  return {
    question,
    facts,
    answer: clip(result.answer),
    refused: isRefusal(result.answer),
    label: labelSays,
    judge: modelSays,
    agree: modelSays === labelSays,
    ms,
  };
}

/** One question the documents cannot answer. A correct outcome is a refusal. */
export function unanswerableRow({ question, result, ms }) {
  const refused = isRefusal(result.answer);
  const cutoff = (result.matchedSources ?? []).length === 0;
  return {
    question,
    answer: clip(result.answer),
    refused,
    by: refused ? (cutoff ? "cutoff" : "model or grounding check") : null,
    ms,
  };
}

export function summarizeAnswers(answerable, unanswerable) {
  const rate = (rows, key) => (rows.length ? round(rows.filter((row) => row[key]).length / rows.length) : 0);
  const all = [...answerable, ...unanswerable];
  return {
    answerable: answerable.length,
    labelCorrect: rate(answerable, "label"),
    judgeCorrect: rate(answerable, "judge"),
    judgeAgreement: rate(answerable, "agree"),
    falseRefusals: answerable.filter((row) => row.refused).length,
    unanswerable: unanswerable.length,
    refused: unanswerable.filter((row) => row.refused).length,
    refusedByCutoff: unanswerable.filter((row) => row.by === "cutoff").length,
    refusedAfterRetrieval: unanswerable.filter((row) => row.refused && row.by !== "cutoff").length,
    answeredAnyway: unanswerable.filter((row) => !row.refused).map((row) => row.question),
    averageMs: all.length ? Math.round(all.reduce((sum, row) => sum + (row.ms ?? 0), 0) / all.length) : 0,
  };
}

/** A small tolerance: a temperature 0 model can still change a word between runs. */
export function answerDrops(current, baseline, tolerance = 0.05) {
  if (!baseline) return [];
  const drops = [];
  if (current.labelCorrect < baseline.labelCorrect - tolerance) {
    drops.push(`label-correct fell from ${baseline.labelCorrect} to ${current.labelCorrect}`);
  }
  if (current.refused < baseline.refused) {
    drops.push(`unanswerable refused fell from ${baseline.refused} to ${current.refused}`);
  }
  return drops;
}

function clip(text, max = 240) {
  const value = String(text ?? "").replace(/\s+/g, " ").trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
