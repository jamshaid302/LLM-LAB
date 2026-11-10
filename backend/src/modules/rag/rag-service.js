import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_USER, SHARED_OWNER } from "../../core/users.js";
import { config } from "../../core/config.js";
import { HttpError } from "../../core/http.js";
import { redactOutput } from "../../core/redact.js";
import { completeOllamaChat, completeOllamaChatResult, streamOllamaChat } from "../../core/ollama-stream.js";
import { createEmbeddings } from "../../core/ollama.js";
import { formatSse, isAbortError } from "../../core/sse.js";
import { stripFenceMarkup } from "../../core/untrusted.js";

import { createAnswerCache } from "./answer-cache.js";
import { splitText } from "./chunking.js";
import { documentName, isProtectedDocument, readCorpus } from "./corpus.js";
import { createEmbedQueue } from "./embed-queue.js";
import { extractPdfText } from "./pdf-text.js";
import { NO_ANSWER, buildRagMessages } from "./prompt.js";
import { groundAnswer } from "./grounding.js";
import { lessonReply } from "./lesson.js";
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
  llm = {
    invoke: (messages) => completeOllamaChat({ messages, options: { temperature: 0 } }),
    complete: (messages) => completeOllamaChatResult({ messages, options: { temperature: 0 } }),
  },
  embeddings = createEmbeddings(),
  corpusPath = DOCS_DIR,
  questionsPath = QUESTIONS_PATH,
  topK = config.rag.topK,
  minScore = config.rag.minScore,
  trace,
  store,
  storeKind = "memory",
  chromaUrl = config.rag.chromaUrl,
  streamChat = (args) =>
    streamOllamaChat({
      baseUrl: config.ollama.baseUrl,
      model: config.ollama.chatModel,
      ...args,
    }),
  answerCache = createAnswerCache(),
  externalJobs = null,
  rerank = null,
  rerankCandidates = 20,
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
    answerCache.clear();
    return result.chunks;
  }

  /**
   * Embed or drop one file. A store that already has the rest of the corpus only
   * touches that file. An empty store embeds the whole folder once.
   */
  async function indexOne(key) {
    const { owner, source } = splitJobKey(key);
    const corpus = await readCorpus(corpusPath);
    const existing = await vectorStore.status();
    const incremental = existing.count > 0 && existing.corpusHash && vectorStore.upsertSource;
    if (!incremental) {
      return sync({ force: true });
    }

    const document = corpus.documents.find((item) => item.source === source && item.owner === owner);
    if (document) {
      await vectorStore.upsertSource(await chunksFrom(document), {
        source,
        owner,
        corpusHash: corpus.hash,
      });
    } else {
      await vectorStore.removeSource(source, { owner, corpusHash: corpus.hash });
    }
    chunkCount = (await vectorStore.status()).count;
    return { chunks: chunkCount, embedded: true, store: vectorStore.kind };
  }

  const embedQueue = createEmbedQueue(async (source) => {
    try {
      return await indexOne(source);
    } finally {
      answerCache.clear();
    }
  });

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
  async function enqueueDocument({ filename, text, data, userId = DEFAULT_USER }) {
    const name = requireDocumentName(filename);
    const root = await corpusDirectory(corpusPath);
    const dir = path.join(root, "users", userId);
    if (name.toLowerCase().endsWith(".pdf")) {
      const buffer = decodePdfData(data);
      let extracted = "";
      try {
        extracted = await extractPdfText(buffer);
      } catch {
        throw new HttpError(400, "Could not read that PDF");
      }
      if (!extracted.trim()) throw new HttpError(400, "This PDF has no extractable text");
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, name), buffer);
    } else {
      const body = typeof text === "string" ? text : "";
      if (!body.trim()) throw new HttpError(400, "The file is empty");
      if (Buffer.byteLength(body) > MAX_DOCUMENT_BYTES) {
        throw new HttpError(400, "File must be at most 512 KB");
      }
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, name), body, "utf-8");
    }

    const key = jobKey(userId, name);
    answerCache.clear();
    if (externalJobs) {
      await externalJobs.enqueue(key, { userId, name });
      return { filename: key, status: "queued", chunks: null, error: null, done: Promise.resolve(null) };
    }
    return embedQueue.enqueue(key);
  }

  /** Upload route. Returns the queued job and does not wait for the embed. */
  async function acceptDocument(input) {
    const job = await enqueueDocument(input);
    return publicJob(job);
  }

  /** Save one file and wait until its embed job finishes. Tests use this. */
  async function addDocument(input) {
    const job = await enqueueDocument(input);
    const result = await job.done;
    if (!result) {
      throw new HttpError(409, "That upload was replaced before embedding finished");
    }
    return { filename: displayName(job.filename), chunks: result.chunks, store: result.store };
  }

  async function listDocuments(userId = DEFAULT_USER) {
    const corpus = await readCorpus(corpusPath);
    return corpus.documents
      .filter((document) => document.owner === SHARED_OWNER || document.owner === userId)
      .map((document) => ({
        name: document.source,
        shared: document.owner === SHARED_OWNER,
        removable: document.owner !== SHARED_OWNER,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async function documentStatus(filename, userId = DEFAULT_USER) {
    const name = documentName(filename);
    if (!name) {
      throw new HttpError(400, "Use a .txt, .md, or .pdf name made of letters, numbers, dots, and dashes");
    }
    const job = embedQueue.get(jobKey(userId, name));
    if (job) return publicJob(job);
    if (externalJobs) {
      const external = await externalJobs.get(jobKey(userId, name));
      if (external) {
        return {
          filename: name,
          status: external.status,
          chunks: external.result?.chunks ?? null,
          error: external.error,
        };
      }
    }
    const documents = await listDocuments(userId);
    if (!documents.some((document) => document.name === name)) {
      throw new HttpError(404, "Document not found");
    }
    return { filename: name, status: "ready", chunks: null, error: null };
  }

  /** Run the embed again after a failed job. The file is already on disk. */
  async function retryDocument(filename, userId = DEFAULT_USER) {
    const name = requireDocumentName(filename);
    const key = jobKey(userId, name);
    if (externalJobs) {
      const current = await externalJobs.get(key);
      if (!current || current.status !== "failed") {
        throw new HttpError(400, "That file is not waiting for a retry");
      }
      const next = await externalJobs.enqueue(key, { userId, name });
      return { filename: name, status: next.status, chunks: null, error: null };
    }
    const current = embedQueue.get(key);
    if (!current || current.status !== "failed") {
      throw new HttpError(400, "That file is not waiting for a retry");
    }
    const root = await corpusDirectory(corpusPath);
    try {
      await fs.access(path.join(root, "users", userId, name));
    } catch (err) {
      if (err?.code === "ENOENT") throw new HttpError(404, "Document not found");
      throw err;
    }
    return publicJob(embedQueue.enqueue(key));
  }

  /**
   * Remove one file that belongs to this person and drop its chunks. An in-flight
   * embed of that file is discarded, then one more pass drops its chunks. Shared
   * sample files stay.
   */
  async function removeDocument(filename, userId = DEFAULT_USER) {
    const name = requireDocumentName(filename);
    const root = await corpusDirectory(corpusPath);
    const target = path.join(root, "users", userId, name);
    try {
      await fs.unlink(target);
    } catch (err) {
      if (err?.code === "ENOENT") throw new HttpError(404, "Document not found");
      throw err;
    }
    const key = jobKey(userId, name);
    answerCache.clear();
    embedQueue.forget(key);
    const job = embedQueue.enqueue(key);
    const result = await job.done;
    if (!result) throw new HttpError(409, "That removal was replaced before it finished");
    embedQueue.forget(key);
    return { filename: name, chunks: result.chunks, store: result.store };
  }

  async function retrieve(question, userId = DEFAULT_USER, k = topK) {
    const hits = await vectorStore.search(question, k, userId);
    return hits.map((hit) => ({
      text: hit.text,
      score: hit.score,
      source: hit.source ?? null,
      owner: hit.owner ?? null,
    }));
  }

  /**
   * The retriever the model sees. With a reranker, the top `rerankCandidates` vector hits
   * are rescored and the best `topK` are kept. If the reranker fails, vector order is used.
   */
  async function retrieveRanked(question, userId = DEFAULT_USER) {
    if (typeof rerank !== "function") {
      return { hits: await retrieve(question, userId), reranked: false, rerankMs: null, rerankError: null };
    }
    const wide = await retrieve(question, userId, Math.max(rerankCandidates, topK));
    const started = Date.now();
    try {
      const ranked = await rerank(question, wide);
      return { hits: ranked.slice(0, topK), reranked: true, rerankMs: Date.now() - started, rerankError: null };
    } catch (err) {
      return { hits: wide.slice(0, topK), reranked: false, rerankMs: null, rerankError: err.message };
    }
  }

  async function listChunks(userId = DEFAULT_USER) {
    if (typeof vectorStore.list !== "function") return [];
    return vectorStore.list(userId);
  }

  async function prepare(question, userId = DEFAULT_USER) {
    const { hits, ...ranking } = await retrieveRanked(question, userId);
    const { matched, dropped } = applyCutoff(hits, minScore);
    const matchedSources = matched.map(present);
    const droppedSources = dropped.map(present);

    if (matched.length === 0) {
      return {
        refused: true,
        answer: NO_ANSWER,
        matchedSources,
        droppedSources,
        ranking,
        prompt: null,
      };
    }

    const lesson = lessonReply(question, matched);
    if (lesson) {
      return {
        refused: false,
        lesson: true,
        answer: lesson,
        matchedSources,
        droppedSources,
        ranking,
        messages: null,
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
      ranking,
      messages: buildRagMessages({ question, docs }),
    };
  }

  async function ask(question, userId = DEFAULT_USER) {
    const cached = externalJobs ? null : answerCache.get(userId, question);
    if (cached) return { ...cached, cached: true };

    const retrievalStarted = Date.now();
    const prepared = await prepare(question, userId);
    const retrievalMs = Date.now() - retrievalStarted;
    const { messages, ranking, ...answerFields } = prepared;
    const result = { ...answerFields, reranked: ranking.reranked };
    if (prepared.lesson) {
      const answer = redactOutput(prepared.answer);
      recordTrace(trace, {
        route: "rag.ask",
        userId,
        retrievalMs,
        generationMs: null,
        refused: false,
        sources: result.matchedSources,
        dropped: result.droppedSources,
        ...ranking,
      });
      const response = { ...result, answer, refused: false, cached: false };
      if (!externalJobs) answerCache.set(userId, question, response);
      return response;
    }
    if (prepared.refused) {
      recordTrace(trace, {
        route: "rag.ask",
        userId,
        retrievalMs,
        generationMs: null,
        refused: true,
        sources: result.matchedSources,
        dropped: result.droppedSources,
        ...ranking,
      });
      const refusedResult = { ...result, cached: false };
      if (!externalJobs) answerCache.set(userId, question, refusedResult);
      return refusedResult;
    }

    const generationStarted = Date.now();
    try {
      const completed =
        typeof llm.complete === "function" ? await llm.complete(messages) : { text: await llm.invoke(messages) };
      const text = typeof completed === "string" ? completed : completed.text;
      const generationMs = Date.now() - generationStarted;
      const verdict = groundAnswer(stripFenceMarkup(text), result.matchedSources);
      const answer = redactOutput(verdict.answer);
      recordTrace(trace, {
        route: "rag.ask",
        userId,
        retrievalMs,
        generationMs,
        promptTokens: completed.promptTokens ?? null,
        completionTokens: completed.completionTokens ?? null,
        refused: !verdict.grounded,
        sources: result.matchedSources,
        dropped: result.droppedSources,
        ...ranking,
      });
      const response = { ...result, answer, refused: !verdict.grounded, cached: false };
      if (!externalJobs) answerCache.set(userId, question, response);
      return response;
    } catch (err) {
      recordTrace(trace, {
        route: "rag.ask",
        userId,
        retrievalMs,
        generationMs: Date.now() - generationStarted,
        refused: false,
        sources: result.matchedSources,
        dropped: result.droppedSources,
        ...ranking,
        error: err.message,
      });
      throw err;
    }
  }

  async function streamAnswer(question, { signal, write, userId = DEFAULT_USER }) {
    const retrievalStarted = Date.now();
    const prepared = await prepare(question, userId);
    const retrievalMs = Date.now() - retrievalStarted;
    write(
      formatSse("meta", {
        refused: prepared.refused,
        matchedSources: prepared.matchedSources,
        droppedSources: prepared.droppedSources,
        reranked: prepared.ranking.reranked,
      }),
    );

    if (prepared.lesson) {
      const answer = redactOutput(prepared.answer);
      write(formatSse("token", { text: answer }));
      write(formatSse("done", { finish: "stop" }));
      recordTrace(trace, {
        route: "rag.stream",
        userId,
        retrievalMs,
        generationMs: null,
        refused: false,
        sources: prepared.matchedSources,
        dropped: prepared.droppedSources,
        ...prepared.ranking,
      });
      return;
    }

    if (prepared.refused) {
      write(formatSse("token", { text: prepared.answer }));
      write(formatSse("done", { finish: "refused" }));
      recordTrace(trace, {
        route: "rag.stream",
        userId,
        retrievalMs,
        generationMs: null,
        refused: true,
        sources: prepared.matchedSources,
        dropped: prepared.droppedSources,
        ...prepared.ranking,
      });
      return;
    }

    const parts = [];
    const generationStarted = Date.now();
    let counts = {};
    let refused = false;
    let error = null;
    try {
      counts =
        (await streamChat({
          messages: prepared.messages,
          signal,
          onToken(token) {
            parts.push(token);
            write(formatSse("token", { text: token }));
          },
        })) ?? {};
      const raw = parts.join("");
      const verdict = groundAnswer(stripFenceMarkup(raw), prepared.matchedSources);
      const answer = redactOutput(verdict.answer);
      refused = !verdict.grounded;
      if (!verdict.grounded || answer !== raw.trim()) {
        write(formatSse("replace", { text: answer, refused }));
      }
      write(formatSse("done", { finish: verdict.grounded ? "stop" : "ungrounded" }));
    } catch (err) {
      if (!isAbortError(err)) error = err.message;
      throw err;
    } finally {
      recordTrace(trace, {
        route: "rag.stream",
        userId,
        retrievalMs,
        generationMs: Date.now() - generationStarted,
        promptTokens: counts.promptTokens ?? null,
        completionTokens: counts.completionTokens ?? null,
        refused,
        sources: prepared.matchedSources,
        dropped: prepared.droppedSources,
        ...prepared.ranking,
        error,
      });
    }
  }

  async function evaluate(userId = DEFAULT_USER) {
    const suite = JSON.parse(await fs.readFile(questionsPath, "utf-8"));
    const items = [];
    for (const item of [...suite.answerable, ...suite.unanswerable]) {
      items.push({ ...item, hits: (await retrieveRanked(item.question, userId)).hits });
    }
    return { ...scoreRetrieval(items, { k: topK, minScore }), reranked: typeof rerank === "function" };
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
    retrieveRanked: async (question, userId) => (await retrieveRanked(question, userId)).hits,
    listChunks,
    evaluate,
    runQueued: (key) => indexOne(key),
    get chunkCount() {
      return chunkCount;
    },
    get minScore() {
      return minScore;
    },
    get storeKind() {
      return vectorStore.kind;
    },
    get reranker() {
      return typeof rerank === "function" ? "cross-encoder" : "off";
    },
  };
}

function recordTrace(trace, record) {
  if (typeof trace !== "function") return;
  trace({
    ...record,
    sources: briefHits(record.sources),
    dropped: briefHits(record.dropped),
  });
}

function briefHits(hits) {
  return (hits ?? []).map((hit) => ({ source: hit.source ?? null, score: hit.score ?? null }));
}

async function chunksFrom(document) {
  const pieces = await splitText(document.text);
  for (const chunk of pieces) {
    chunk.metadata = { ...chunk.metadata, source: document.source, owner: document.owner ?? SHARED_OWNER };
  }
  return pieces;
}

async function corpusDirectory(target) {
  const stat = await fs.stat(target);
  return stat.isDirectory() ? target : path.dirname(target);
}

function jobKey(owner, name) {
  return `${owner}/${name}`;
}

function splitJobKey(key) {
  const slash = String(key).indexOf("/");
  if (slash === -1) return { owner: DEFAULT_USER, source: key };
  return { owner: key.slice(0, slash), source: key.slice(slash + 1) };
}

function displayName(key) {
  return splitJobKey(key).source;
}

function publicJob(job) {
  return {
    filename: displayName(job.filename),
    status: job.status,
    chunks: job.chunks,
    error: job.error,
  };
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
