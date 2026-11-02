import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createHash } from "node:crypto";

import { config } from "../../core/config.js";
import { streamOllamaChat } from "../../core/ollama-stream.js";
import { createChatModel, createEmbeddings } from "../../core/ollama.js";
import { formatSse } from "../../core/sse.js";

import { splitText } from "./chunking.js";
import { NO_ANSWER, buildRagPrompt } from "./prompt.js";
import { applyCutoff, scoreRetrieval } from "./retrieval.js";
import { createVectorStore } from "./store.js";

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
  store,
  storeKind = "memory",
  chromaUrl = config.rag.chromaUrl,
  streamChat = (args) =>
    streamOllamaChat({
      baseUrl: config.ollama.baseUrl,
      model: config.ollama.chatModel,
      ...args,
    }),
} = {}) {
  const vectorStore =
    store ?? createVectorStore({ kind: storeKind, embeddings, chromaUrl });
  let chunkCount = 0;
  const sourceName = path.basename(corpusPath);

  async function sync({ force }) {
    const raw = await fs.readFile(corpusPath, "utf-8");
    const hash = createHash("sha256").update(raw).digest("hex");

    if (!force) {
      const existing = await vectorStore.status();
      const sameCorpus = existing.corpusHash === hash;
      const cosine = vectorStore.kind !== "chroma" || existing.space === "cosine";
      if (existing.count > 0 && sameCorpus && cosine) {
        chunkCount = existing.count;
        return { chunks: chunkCount, embedded: false, store: vectorStore.kind };
      }
    }

    const chunks = await splitText(raw);
    for (const chunk of chunks) {
      chunk.metadata = { ...chunk.metadata, source: sourceName };
    }

    // Replace rather than append, so a second ingest never duplicates entries.
    await vectorStore.replace(chunks, { corpusHash: hash });
    chunkCount = chunks.length;
    return { chunks: chunkCount, embedded: true, store: vectorStore.kind };
  }

  /** Startup path. Chroma skips the embed when this corpus is already stored. */
  async function load() {
    return sync({ force: false });
  }

  /** Re-ingest button and tests. Always rebuilds. */
  async function ingest() {
    const result = await sync({ force: true });
    return result.chunks;
  }

  async function retrieve(question) {
    const hits = await vectorStore.search(question, topK);
    return hits.map((hit) => ({
      text: hit.text,
      score: hit.score,
      source: hit.source ?? sourceName,
    }));
  }

  async function prepare(question) {
    const hits = await retrieve(question);
    const { matched, dropped } = applyCutoff(hits, minScore);
    const matchedSources = matched.map(present);
    const droppedSources = dropped.map(present);

    if (matched.length === 0) {
      return {
        refused: true,
        answer: NO_ANSWER,
        matchedSources,
        droppedSources,
        prompt: null,
      };
    }

    const docs = matched.map((hit) => ({
      pageContent: hit.text,
      metadata: { source: hit.source },
    }));
    return {
      refused: false,
      answer: null,
      matchedSources,
      droppedSources,
      prompt: buildRagPrompt({ question, docs }),
    };
  }

  async function ask(question) {
    const prepared = await prepare(question);
    const { prompt, ...result } = prepared;
    if (prepared.refused) return result;
    return { ...result, answer: await llm.invoke(prompt) };
  }

  async function streamAnswer(question, { signal, write }) {
    const prepared = await prepare(question);
    write(
      formatSse("meta", {
        refused: prepared.refused,
        matchedSources: prepared.matchedSources,
        droppedSources: prepared.droppedSources,
      }),
    );

    if (prepared.refused) {
      write(formatSse("token", { text: prepared.answer }));
      write(formatSse("done", { finish: "refused" }));
      return;
    }

    await streamChat({
      messages: [{ role: "user", content: prepared.prompt }],
      signal,
      onToken(token) {
        write(formatSse("token", { text: token }));
      },
    });
    write(formatSse("done", { finish: "stop" }));
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
    load,
    ask,
    streamAnswer,
    retrieve,
    evaluate,
    get chunkCount() {
      return chunkCount;
    },
    get minScore() {
      return minScore;
    },
    get storeKind() {
      return vectorStore.kind;
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
