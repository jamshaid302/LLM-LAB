import fs from "node:fs/promises";

import { config } from "../core/config.js";
import { createCrossEncoder, rerankWithCrossEncoder } from "../core/cross-encoder.js";
import { completeOllamaChat } from "../core/ollama-stream.js";

import { createAgentsModule } from "./agents/index.js";
import { createConversationsModule } from "./conversations/index.js";
import { createDeploymentModule } from "./deployment/index.js";
import { createDocumentPipelineModule } from "./documents/index.js";
import { createAdvancedRagModule } from "./advanced-rag/index.js";
import { createEvaluationModule } from "./evaluation/index.js";
import { createFundamentalsModule } from "./fundamentals/index.js";
import { createHallucinationModule } from "./hallucination/index.js";
import { createObservabilityModule, loadTraces } from "./observability/index.js";
import { createTraceLog } from "./observability/trace-log.js";
import { createProvidersModule } from "./providers/index.js";
import { applyCutoff, scoreRetrieval } from "./rag/retrieval.js";
import { QUESTIONS_PATH, createRagService } from "./rag/rag-service.js";
import { readBaseline } from "./rag/eval/report.js";
import { createMongoJobStore } from "./rag/job-pump.js";
import { createRagModule } from "./rag/index.js";
import { createConfiguredSession, createSecurityModule } from "./security/index.js";
import { createSemanticSearchModule } from "./semantic-search/index.js";
import { createStreamingModule } from "./streaming/index.js";
import { createStreamingService } from "./streaming/service.js";

/**
 * Every module exposes { id, name, router, init?, health? } and is mounted at /api/<id>.
 * Modules receive shared services from core/ and must not import each other.
 * This file is the one place that may wire them together.
 */
export function createModules() {
  const memory = createTraceLog();
  let traceCollection = null;
  const traces = {
    add(record) {
      const saved = memory.add(record);
      if (traceCollection) traceCollection.insertOne(saved).catch(() => {});
      return saved;
    },
    list: () => memory.list(),
    restore: (rows) => memory.restore(rows),
  };
  const record = (entry) => traces.add(entry);
  const crossEncoder = config.rerank.mode === "cross-encoder" ? createCrossEncoder() : null;
  const ragService = createRagService({
    storeKind: config.rag.store,
    trace: record,
    externalJobs: config.embed.worker === "external" ? lazyJobStore() : null,
    rerank: crossEncoder ? (question, hits) => rerankWithCrossEncoder(hits, question, crossEncoder) : null,
    rerankCandidates: config.rerank.candidates,
  });

  let labels;
  async function labelFor(question) {
    if (!labels) {
      const suite = JSON.parse(await fs.readFile(QUESTIONS_PATH, "utf8"));
      labels = new Map(
        (suite.answerable ?? []).map((item) => [item.question.trim().toLowerCase(), item.answer ?? item.expect]),
      );
    }
    return labels.get(String(question).trim().toLowerCase()) ?? null;
  }

  return [
    createFundamentalsModule(),
    createProvidersModule(),
    createRagModule({ service: ragService }),
    createAdvancedRagModule({
      k: config.rag.topK,
      minScore: config.rag.minScore,
      candidateK: config.rerank.candidates,
      searchWide: (question, userId) => ragService.retrieve(question, userId, config.rerank.candidates),
      listChunks: (userId) => ragService.listChunks(userId),
      loadSuite: async () => JSON.parse(await fs.readFile(QUESTIONS_PATH, "utf-8")),
      score: (items) => scoreRetrieval(items, { k: config.rag.topK, minScore: config.rag.minScore }),
      crossEncoder: crossEncoder ?? createCrossEncoder(),
      retriever: crossEncoder ? "vector + cross-encoder" : "vector",
    }),
    createSemanticSearchModule({
      minScore: config.rag.minScore,
      search: async (question, userId) => {
        const hits = await ragService.retrieve(question, userId);
        return applyCutoff(hits, config.rag.minScore);
      },
    }),
    createDocumentPipelineModule({
      listDocuments: (userId) => ragService.listDocuments(userId),
      documentStatus: (filename, userId) => ragService.documentStatus(filename, userId),
      acceptDocument: (input) => ragService.acceptDocument(input),
      retryDocument: (filename, userId) => ragService.retryDocument(filename, userId),
      removeDocument: (filename, userId) => ragService.removeDocument(filename, userId),
    }),
    createStreamingModule({ service: createStreamingService({ trace: record }) }),
    createConversationsModule({
      trace: record,
      retrieveContext: async (question, userId) => {
        const hits = await ragService.retrieveRanked(question, userId);
        return applyCutoff(hits, config.rag.minScore).matched;
      },
    }),
    createObservabilityModule({
      log: traces,
      connect: async () => {
        const loaded = await loadTraces();
        traceCollection = loaded.collection;
        return loaded.rows;
      },
    }),
    createEvaluationModule({
      run: (userId) => ragService.evaluate(userId),
      loadBaseline: () => readBaseline(),
    }),
    createHallucinationModule({
      ask: (question, userId) => ragService.ask(question, userId),
      complete: (prompt) =>
        completeOllamaChat({
          baseUrl: config.ollama.baseUrl,
          model: config.ollama.chatModel,
          messages: [{ role: "user", content: prompt }],
        }),
      labelFor,
    }),
    createAgentsModule({
      search: async (query, userId) => {
        const hits = await ragService.retrieveRanked(query, userId);
        return applyCutoff(hits, config.rag.minScore).matched;
      },
    }),
    createSecurityModule({ session: createConfiguredSession() }),
    createDeploymentModule(),
  ];
}

function lazyJobStore() {
  let store;
  return {
    async enqueue(id, payload) {
      return (await ready()).enqueue(id, payload);
    },
    async get(id) {
      return (await ready()).get(id);
    },
  };

  async function ready() {
    if (!store) {
      const { MongoClient } = await import("mongodb");
      const client = new MongoClient(config.mongo.url, { serverSelectionTimeoutMS: 2000 });
      await client.connect();
      store = createMongoJobStore(client.db().collection("embedJobs"));
    }
    return store;
  }
}
