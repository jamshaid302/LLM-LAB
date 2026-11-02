import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MemoryVectorStore } from "langchain/vectorstores/memory";

import { config } from "../../core/config.js";
import { createChatModel, createEmbeddings } from "../../core/ollama.js";

import { splitText } from "./chunking.js";
import { NO_ANSWER, buildRagPrompt } from "./prompt.js";
import { applyCutoff, scoreRetrieval } from "./retrieval.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_CORPUS = path.join(moduleDir, "docs", "knowledge.txt");
export const QUESTIONS_PATH = path.join(moduleDir, "eval", "questions.json");

/**
 * The RAG pipeline, with its dependencies injected so tests can supply fakes
 * instead of requiring a running Ollama.
 */
export function createRagService({
  llm = createChatModel(),
  embeddings = createEmbeddings(),
  corpusPath = DEFAULT_CORPUS,
  questionsPath = QUESTIONS_PATH,
  topK = config.rag.topK,
  minScore = config.rag.minScore,
} = {}) {
  let vectorStore = new MemoryVectorStore(embeddings);
  let chunkCount = 0;
  const sourceName = path.basename(corpusPath);

  async function ingest() {
    const raw = await fs.readFile(corpusPath, "utf-8");
    const chunks = await splitText(raw);
    for (const chunk of chunks) {
      chunk.metadata = { ...chunk.metadata, source: sourceName };
    }

    // Rebuild rather than append, so re-ingesting never duplicates entries.
    vectorStore = new MemoryVectorStore(embeddings);
    await vectorStore.addDocuments(chunks);

    chunkCount = chunks.length;
    return chunkCount;
  }

  async function retrieve(question) {
    const results = await vectorStore.similaritySearchWithScore(question, topK);
    return results.map(([doc, score]) => ({
      text: doc.pageContent,
      score,
      source: doc.metadata?.source ?? sourceName,
    }));
  }

  async function ask(question) {
    const hits = await retrieve(question);
    const { matched, dropped } = applyCutoff(hits, minScore);

    if (matched.length === 0) {
      return {
        answer: NO_ANSWER,
        refused: true,
        matchedSources: [],
        droppedSources: dropped.map(present),
      };
    }

    const docs = matched.map((hit) => ({
      pageContent: hit.text,
      metadata: { source: hit.source },
    }));
    const answer = await llm.invoke(buildRagPrompt({ question, docs }));

    return {
      answer,
      refused: false,
      matchedSources: matched.map(present),
      droppedSources: dropped.map(present),
    };
  }

  async function evaluate() {
    const suite = JSON.parse(await fs.readFile(questionsPath, "utf-8"));
    const items = [];
    for (const item of [...suite.answerable, ...suite.unanswerable]) {
      items.push({ ...item, hits: await retrieve(item.question) });
    }
    return scoreRetrieval(items, { k: topK, minScore });
  }

  return {
    ingest,
    ask,
    retrieve,
    evaluate,
    get chunkCount() {
      return chunkCount;
    },
    get minScore() {
      return minScore;
    },
  };
}

function present(hit) {
  return {
    text: hit.text,
    score: hit.score.toFixed(3),
    source: hit.source,
  };
}
