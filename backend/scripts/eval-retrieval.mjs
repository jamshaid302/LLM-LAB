// Live retrieval score with Ollama embeddings and the memory store.
// Usage from backend/:  npm run eval:retrieval            compare with baseline.json, exit 1 on a drop
//                       npm run eval:retrieval -- --write  save the new numbers
import fs from "node:fs/promises";

import { config } from "../src/core/config.js";
import { SHARED_OWNER } from "../src/core/users.js";
import { QUESTIONS_PATH, createRagService } from "../src/modules/rag/rag-service.js";
import { liveReranker, readBaseline, retrievalDrops, retrievalSummary, writeBaseline } from "../src/modules/rag/eval/report.js";

const write = process.argv.includes("--write");
const rag = createRagService({ storeKind: "memory", ...liveReranker() });
const started = Date.now();
await rag.load();
const report = await rag.evaluate(SHARED_OWNER);
const chunks = await rag.listChunks(SHARED_OWNER);
const suite = JSON.parse(await fs.readFile(QUESTIONS_PATH, "utf8"));
const summary = {
  ...retrievalSummary(report, { chunks, suite, embedModel: config.ollama.embedModel }),
  reranker: rag.reranker === "off" ? "off" : config.rerank.model,
};
const baseline = await readBaseline();
const drops = retrievalDrops(summary, baseline);

console.log(JSON.stringify({ ...summary, seconds: Math.round((Date.now() - started) / 1000) }, null, 2));
if (write) {
  await writeBaseline({ ...baseline, ...summary });
  console.log("Saved to eval/baseline.json");
} else if (drops.length) {
  console.error(`Retrieval dropped: ${drops.join("; ")}`);
  process.exitCode = 1;
} else {
  console.log("No drop compared with eval/baseline.json");
}
