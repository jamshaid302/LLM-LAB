import fs from "node:fs/promises";

import { config } from "../core/config.js";

import { createAgentsModule } from "./agents/index.js";
import { createConversationsModule } from "./conversations/index.js";
import { createDocumentPipelineModule } from "./documents/index.js";
import { createAdvancedRagModule } from "./advanced-rag/index.js";
import { createEvaluationModule } from "./evaluation/index.js";
import { createFundamentalsModule } from "./fundamentals/index.js";
import { createHallucinationModule } from "./hallucination/index.js";
import { createObservabilityModule } from "./observability/index.js";
import { createTraceLog } from "./observability/trace-log.js";
import { createProvidersModule } from "./providers/index.js";
import { applyCutoff, scoreRetrieval } from "./rag/retrieval.js";
import { QUESTIONS_PATH, createRagService } from "./rag/rag-service.js";
import { createRagModule } from "./rag/index.js";
import { createSemanticSearchModule } from "./semantic-search/index.js";
import { createStreamingModule } from "./streaming/index.js";
import { createStreamingService } from "./streaming/service.js";

/**
 * Every module exposes { id, name, router, init?, health? } and is mounted at /api/<id>.
 * Modules receive shared services from core/ and must not import each other.
 * This file is the one place that may wire them together.
 */
export function createModules() {
  const traces = createTraceLog();
  const record = (entry) => traces.add(entry);
  const ragService = createRagService({ storeKind: config.rag.store, trace: record });

  return [
    createFundamentalsModule(),
    createProvidersModule(),
    createRagModule({ service: ragService }),
    createAdvancedRagModule({
      k: config.rag.topK,
      minScore: config.rag.minScore,
      searchWide: (question, userId) => ragService.retrieve(question, userId, 20),
      listChunks: (userId) => ragService.listChunks(userId),
      loadSuite: async () => JSON.parse(await fs.readFile(QUESTIONS_PATH, "utf-8")),
      score: (items) => scoreRetrieval(items, { k: config.rag.topK, minScore: config.rag.minScore }),
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
        const hits = await ragService.retrieve(question, userId);
        return applyCutoff(hits, config.rag.minScore).matched;
      },
    }),
    createObservabilityModule({ log: traces }),
    createEvaluationModule({
      run: (userId) => ragService.evaluate(userId),
    }),
    createHallucinationModule({
      ask: (question, userId) => ragService.ask(question, userId),
    }),
    createAgentsModule({
      search: async (query, userId) => {
        const hits = await ragService.retrieve(query, userId);
        return applyCutoff(hits, config.rag.minScore).matched;
      },
    }),
  ];
}
