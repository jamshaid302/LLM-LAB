import { completeOllamaChatResult } from "../src/core/ollama-stream.js";
import { SHARED_OWNER } from "../src/core/users.js";
import { createRagService } from "../src/modules/rag/rag-service.js";
import { groundAnswer } from "../src/modules/rag/grounding.js";
import { liveReranker } from "../src/modules/rag/eval/report.js";

const model = process.argv[2] ?? "qwen2.5:7b";
const questions = process.argv.slice(3);
let raw = "";
let sent = null;
const rag = createRagService({
  storeKind: "memory",
  llm: {
    complete: async (messages) => {
      sent = messages;
      const result = await completeOllamaChatResult({ model, messages, options: { temperature: 0 } });
      raw = result.text;
      return result;
    },
  },
  ...liveReranker(),
});
await rag.load();
for (const question of questions) {
  raw = "";
  const result = await rag.ask(question, SHARED_OWNER);
  console.log("Q:", question);
  console.log("sources:", result.matchedSources.map((s) => `${s.source} ${s.score}`).join(" | "));
  console.log("raw:", JSON.stringify(raw));
  console.log("final:", JSON.stringify(result.answer));
  if (raw) console.log("grounding:", JSON.stringify(groundAnswer(raw, result.matchedSources)));
  console.log("context chars:", sent?.[1]?.content?.length);
  console.log("---");
}
