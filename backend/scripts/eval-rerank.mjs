// Live comparison: vector top 3 against hybrid, overlap rerank, cross-encoder rerank, and
// parent-document text, all from the same top 20 vector candidates.
// Usage from backend/:  npm run eval:rerank            print the comparison
//                       npm run eval:rerank -- --write  save it under "rerank" in baseline.json
import fs from "node:fs/promises";

import { config } from "../src/core/config.js";
import { createCrossEncoder } from "../src/core/cross-encoder.js";
import { SHARED_OWNER } from "../src/core/users.js";
import { createAdvancedRagService } from "../src/modules/advanced-rag/service.js";
import { QUESTIONS_PATH, createRagService } from "../src/modules/rag/rag-service.js";
import { readBaseline, today, writeBaseline } from "../src/modules/rag/eval/report.js";
import { scoreRetrieval } from "../src/modules/rag/retrieval.js";

const write = process.argv.includes("--write");
const k = config.rag.topK;
const minScore = config.rag.minScore;
const rag = createRagService({ storeKind: "memory" });
await rag.load();
const crossEncoder = createCrossEncoder();
const service = createAdvancedRagService({
  k,
  minScore,
  candidateK: config.rerank.candidates,
  searchWide: (question, userId) => rag.retrieve(question, userId, config.rerank.candidates),
  listChunks: (userId) => rag.listChunks(userId),
  loadSuite: async () => JSON.parse(await fs.readFile(QUESTIONS_PATH, "utf8")),
  score: (items) => scoreRetrieval(items, { k, minScore }),
  crossEncoder,
});

const started = Date.now();
const result = await service.compare(SHARED_OWNER);
const brief = (report) =>
  report && {
    recallAfter: Math.round(report.recallAtK.after * 1000) / 1000,
    mrrAfter: Math.round(report.mrr.after * 1000) / 1000,
    refusedByCutoff: report.refusedByCutoff,
    missed: report.details.filter((row) => !row.foundAfter).map((row) => row.question),
  };
const summary = {
  measured: today(),
  model: result.crossEncoderModel,
  candidateK: result.candidateK,
  k,
  error: result.crossEncoderError,
  vector: brief(result.vector),
  hybrid: brief(result.hybrid),
  overlap: brief(result.rerank),
  crossEncoder: brief(result.crossEncoder),
  parent: brief(result.parent),
  kept: {
    hybrid: result.kept,
    overlap: result.rerankKept,
    crossEncoder: result.crossEncoderKept,
    parent: result.parentKept,
  },
};

console.log(JSON.stringify({ ...summary, seconds: Math.round((Date.now() - started) / 1000) }, null, 2));
if (write) {
  const baseline = await readBaseline();
  await writeBaseline({ ...baseline, rerank: summary });
  console.log("Saved under rerank in eval/baseline.json");
}
