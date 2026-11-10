// Live answer quality: every question goes through the real RAG ask path (retrieval,
// reranker, prompt, chat model, grounding check, redaction). Answerable questions are then
// graded twice: by the human label (the fact must appear in the answer) and by an LLM judge.
// Unanswerable questions pass only when the system refuses.
//
// Usage from backend/:
//   npm run eval:answers                                  compare with baseline.json, exit 1 on a drop
//   npm run eval:answers -- --model llama3.2:1b           try another chat model
//   npm run eval:answers -- --judge-model qwen2.5:7b      grade with a different model
//   npm run eval:answers -- --limit 5                     quick look at the first 5 of each list
//   npm run eval:answers -- --write                       save under answers.<model> in baseline.json
import fs from "node:fs/promises";

import { config } from "../src/core/config.js";
import { completeOllamaChat, completeOllamaChatResult } from "../src/core/ollama-stream.js";
import { SHARED_OWNER } from "../src/core/users.js";
import { answerHasFacts, judgePrompt, labelFacts } from "../src/modules/hallucination/service.js";
import { QUESTIONS_PATH, createRagService } from "../src/modules/rag/rag-service.js";
import { createAnswerCache } from "../src/modules/rag/answer-cache.js";
import {
  answerDrops,
  answerableRow,
  liveReranker,
  readBaseline,
  summarizeAnswers,
  today,
  unanswerableRow,
  writeBaseline,
} from "../src/modules/rag/eval/report.js";

function flag(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

const model = flag("--model") ?? config.ollama.chatModel;
const judgeModel = flag("--judge-model") ?? model;
const limit = Number(flag("--limit") ?? Infinity);
const write = process.argv.includes("--write");

const rag = createRagService({
  storeKind: "memory",
  answerCache: createAnswerCache({ max: 0 }),
  llm: {
    complete: (messages) => completeOllamaChatResult({ model, messages, options: { temperature: 0 } }),
  },
  ...liveReranker(),
});
await rag.load();

const suite = JSON.parse(await fs.readFile(QUESTIONS_PATH, "utf8"));
const answerable = [];
const unanswerable = [];
const started = Date.now();

for (const item of suite.answerable.slice(0, limit)) {
  const facts = labelFacts(item.answer ?? item.expect);
  const t0 = Date.now();
  const result = await rag.ask(item.question, SHARED_OWNER);
  const judgeReply = await completeOllamaChat({
    model: judgeModel,
    messages: [{ role: "user", content: judgePrompt({ question: item.question, answer: result.answer, expect: facts }) }],
    options: { temperature: 0 },
  });
  const row = answerableRow({
    question: item.question,
    facts,
    result,
    judgeReply,
    labelSays: answerHasFacts(result.answer, facts),
    ms: Date.now() - t0,
  });
  answerable.push(row);
  console.log(`${row.label ? "ok  " : "MISS"} judge=${row.judge ? "yes" : "no "} ${item.question}`);
}

for (const item of suite.unanswerable.slice(0, limit)) {
  const t0 = Date.now();
  const result = await rag.ask(item.question, SHARED_OWNER);
  const row = unanswerableRow({ question: item.question, result, ms: Date.now() - t0 });
  unanswerable.push(row);
  console.log(`${row.refused ? `refused (${row.by})` : "ANSWERED"} ${item.question}`);
}

const summary = summarizeAnswers(answerable, unanswerable);
const entry = {
  measured: today(),
  chatModel: model,
  judgeModel,
  reranker: rag.reranker === "off" ? "off" : config.rerank.model,
  ...summary,
  rows: { answerable, unanswerable },
};
console.log(JSON.stringify({ ...summary, seconds: Math.round((Date.now() - started) / 1000) }, null, 2));

const baseline = await readBaseline();
if (write) {
  if (Number.isFinite(limit)) {
    console.error("Not saved: --limit runs are partial. Run the full set with --write.");
    process.exitCode = 1;
  } else {
    await writeBaseline({ ...baseline, answers: { ...(baseline.answers ?? {}), [model]: entry } });
    console.log(`Saved under answers["${model}"] in eval/baseline.json`);
  }
} else {
  const drops = answerDrops(summary, baseline.answers?.[model]);
  if (drops.length) {
    console.error(`Answers dropped: ${drops.join("; ")}`);
    process.exitCode = 1;
  }
}
