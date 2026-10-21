import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MemoryVectorStore } from "langchain/vectorstores/memory";

import { config } from "../../core/config.js";
import { createChatModel, createEmbeddings } from "../../core/ollama.js";

import { splitText } from "./chunking.js";
import { buildRagPrompt } from "./prompt.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_CORPUS = path.join(moduleDir, "docs", "knowledge.txt");

/**
 * The RAG pipeline, with its dependencies injected so tests can supply fakes
 * instead of requiring a running Ollama.
 */
export function createRagService({
  llm = createChatModel(),
  embeddings = createEmbeddings(),
  corpusPath = DEFAULT_CORPUS,
  topK = config.rag.topK,
} = {}) {
  let vectorStore = new MemoryVectorStore(embeddings);
  let chunkCount = 0;

  async function ingest() {
    const raw = await fs.readFile(corpusPath, "utf-8");
    const chunks = await splitText(raw);

    // Rebuild rather than append, so re-ingesting never duplicates entries.
    vectorStore = new MemoryVectorStore(embeddings);
    await vectorStore.addDocuments(chunks);

    chunkCount = chunks.length;
    return chunkCount;
  }

  async function ask(question) {
    const results = await vectorStore.similaritySearchWithScore(question, topK);
    const docs = results.map(([doc]) => doc);

    const answer = await llm.invoke(buildRagPrompt({ question, docs }));

    return {
      answer,
      matchedSources: results.map(([doc, score]) => ({
        text: doc.pageContent,
        score: score.toFixed(3),
      })),
    };
  }

  return {
    ingest,
    ask,
    get chunkCount() {
      return chunkCount;
    },
  };
}
