import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "../../core/config.js";
import { HttpError } from "../../core/http.js";
import { streamOllamaChat } from "../../core/ollama-stream.js";
import { createChatModel, createEmbeddings } from "../../core/ollama.js";
import { formatSse } from "../../core/sse.js";

import { splitText } from "./chunking.js";
import { documentName, isProtectedDocument, listCorpusFiles, readCorpus } from "./corpus.js";
import { createEmbedQueue } from "./embed-queue.js";
import { extractPdfText } from "./pdf-text.js";
import { NO_ANSWER, buildRagPrompt } from "./prompt.js";
import { applyCutoff, scoreRetrieval } from "./retrieval.js";
import { createVectorStore } from "./store.js";

const MAX_DOCUMENT_BYTES = 512 * 1024;

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const DOCS_DIR = path.join(moduleDir, "docs");
export const DEFAULT_CORPUS = path.join(DOCS_DIR, "knowledge.txt");
export const QUESTIONS_PATH = path.join(moduleDir, "eval", "questions.json");

/**
 * The RAG pipeline, with its dependencies injected so tests can supply fakes
 * instead of requiring a running Ollama.
 */
export function createRagService({
  llm = createChatModel(),
  embeddings = createEmbeddings(),
  corpusPath = DOCS_DIR,
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

  async function sync({ force }) {
    const corpus = await readCorpus(corpusPath);
    const hash = corpus.hash;

    if (!force) {
      const existing = await vectorStore.status();
      const sameCorpus = existing.corpusHash === hash;
      const cosine = vectorStore.kind !== "chroma" || existing.space === "cosine";
      if (existing.count > 0 && sameCorpus && cosine) {
        chunkCount = existing.count;
        return { chunks: chunkCount, embedded: false, store: vectorStore.kind };
      }
    }

    const chunks = [];
    for (const document of corpus.documents) {
      chunks.push(...(await chunksFrom(document)));
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

  /** Re-ingest button and tests. Waits for queued file jobs, then rebuilds the folder. */
  async function ingest() {
    await embedQueue.whenIdle();
    const result = await sync({ force: true });
    return result.chunks;
  }

  /**
   * Embed or drop one file. A store that already has the rest of the corpus only
   * touches that file. An empty store embeds the whole folder once.
   */
  async function indexOne(source) {
    const corpus = await readCorpus(corpusPath);
    const existing = await vectorStore.status();
    const incremental = existing.count > 0 && existing.corpusHash && vectorStore.upsertSource;
    if (!incremental) {
      return sync({ force: true });
    }

    const document = corpus.documents.find((item) => item.source === source);
    if (document) {
      await vectorStore.upsertSource(await chunksFrom(document), { source, corpusHash: corpus.hash });
    } else {
      await vectorStore.removeSource(source, { corpusHash: corpus.hash });
    }
    chunkCount = (await vectorStore.status()).count;
    return { chunks: chunkCount, embedded: true, store: vectorStore.kind };
  }

  const embedQueue = createEmbedQueue((source) => indexOne(source));

  function requireDocumentName(filename) {
    const name = documentName(filename);
    if (!name) {
      throw new HttpError(400, "Use a .txt, .md, or .pdf name made of letters, numbers, dots, and dashes");
    }
    if (isProtectedDocument(name)) {
      throw new HttpError(400, "knowledge.txt and office.txt stay in the knowledge base");
    }
    return name;
  }

  /** Check and store one file, then enqueue its embed. Does not wait for vectors. */
  async function enqueueDocument({ filename, text, data }) {
    const name = requireDocumentName(filename);
    const dir = await corpusDirectory(corpusPath);
    if (name.toLowerCase().endsWith(".pdf")) {
      const buffer = decodePdfData(data);
      let extracted = "";
      try {
        extracted = await extractPdfText(buffer);
      } catch {
        throw new HttpError(400, "Could not read that PDF");
      }
      if (!extracted.trim()) throw new HttpError(400, "This PDF has no extractable text");
      await fs.writeFile(path.join(dir, name), buffer);
    } else {
      const body = typeof text === "string" ? text : "";
      if (!body.trim()) throw new HttpError(400, "The file is empty");
      if (Buffer.byteLength(body) > MAX_DOCUMENT_BYTES) {
        throw new HttpError(400, "File must be at most 512 KB");
      }
      await fs.writeFile(path.join(dir, name), body, "utf-8");
    }

    return embedQueue.enqueue(name);
  }

  /** Upload route. Returns the queued job and does not wait for the embed. */
  async function acceptDocument(input) {
    return embedQueue.present(await enqueueDocument(input));
  }

  /** Save one file and wait until its embed job finishes. Tests use this. */
  async function addDocument(input) {
    const job = await enqueueDocument(input);
    const result = await job.done;
    if (!result) {
      throw new HttpError(409, "That upload was replaced before embedding finished");
    }
    return { filename: job.filename, chunks: result.chunks, store: result.store };
  }

  async function listDocuments() {
    const dir = await corpusDirectory(corpusPath);
    return listCorpusFiles(dir);
  }

  async function documentStatus(filename) {
    const name = documentName(filename);
    if (!name) {
      throw new HttpError(400, "Use a .txt, .md, or .pdf name made of letters, numbers, dots, and dashes");
    }
    const job = embedQueue.get(name);
    if (job) return job;
    const documents = await listDocuments();
    if (!documents.some((document) => document.name === name)) {
      throw new HttpError(404, "Document not found");
    }
    return { filename: name, status: "ready", chunks: null, error: null };
  }

  /** Run the embed again after a failed job. The file is already on disk. */
  async function retryDocument(filename) {
    const name = requireDocumentName(filename);
    const current = embedQueue.get(name);
    if (!current || current.status !== "failed") {
      throw new HttpError(400, "That file is not waiting for a retry");
    }
    const dir = await corpusDirectory(corpusPath);
    try {
      await fs.access(path.join(dir, name));
    } catch (err) {
      if (err?.code === "ENOENT") throw new HttpError(404, "Document not found");
      throw err;
    }
    return embedQueue.present(embedQueue.enqueue(name));
  }

  /**
   * Remove one uploaded file and drop its chunks. An in-flight embed of that file
   * is discarded, then one more pass drops its chunks, so a late job cannot write
   * them back. The sample files stay embedded.
   */
  async function removeDocument(filename) {
    const name = requireDocumentName(filename);
    const dir = await corpusDirectory(corpusPath);
    const target = path.join(dir, name);
    try {
      await fs.unlink(target);
    } catch (err) {
      if (err?.code === "ENOENT") throw new HttpError(404, "Document not found");
      throw err;
    }
    embedQueue.forget(name);
    const job = embedQueue.enqueue(name);
    const result = await job.done;
    if (!result) throw new HttpError(409, "That removal was replaced before it finished");
    embedQueue.forget(name);
    return { filename: name, chunks: result.chunks, store: result.store };
  }

  async function retrieve(question) {
    const hits = await vectorStore.search(question, topK);
    return hits.map((hit) => ({
      text: hit.text,
      score: hit.score,
      source: hit.source ?? null,
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
    acceptDocument,
    addDocument,
    documentStatus,
    retryDocument,
    listDocuments,
    removeDocument,
    whenIdle: () => embedQueue.whenIdle(),
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

async function chunksFrom(document) {
  const pieces = await splitText(document.text);
  for (const chunk of pieces) {
    chunk.metadata = { ...chunk.metadata, source: document.source };
  }
  return pieces;
}

async function corpusDirectory(target) {
  const stat = await fs.stat(target);
  return stat.isDirectory() ? target : path.dirname(target);
}

function decodePdfData(data) {
  if (typeof data !== "string" || !data.trim()) {
    throw new HttpError(400, "PDF data is required");
  }
  const buffer = Buffer.from(data, "base64");
  if (buffer.length === 0) throw new HttpError(400, "PDF data is required");
  if (buffer.length > MAX_DOCUMENT_BYTES) {
    throw new HttpError(400, "File must be at most 512 KB");
  }
  return buffer;
}

function present(hit) {
  return {
    text: hit.text,
    score: hit.score.toFixed(3),
    source: hit.source,
  };
}
