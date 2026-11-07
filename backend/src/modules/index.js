import { config } from "../core/config.js";

import { createConversationsModule } from "./conversations/index.js";
import { createDocumentPipelineModule } from "./documents/index.js";
import { createFundamentalsModule } from "./fundamentals/index.js";
import { createProvidersModule } from "./providers/index.js";
import { applyCutoff } from "./rag/retrieval.js";
import { createRagService } from "./rag/rag-service.js";
import { createRagModule } from "./rag/index.js";
import { createSemanticSearchModule } from "./semantic-search/index.js";
import { createStreamingModule } from "./streaming/index.js";

/**
 * Every module exposes { id, name, router, init?, health? } and is mounted at /api/<id>.
 * Modules receive shared services from core/ and must not import each other.
 * This file is the one place that may wire them together.
 */
export function createModules() {
  const ragService = createRagService({ storeKind: config.rag.store });

  return [
    createFundamentalsModule(),
    createProvidersModule(),
    createRagModule({ service: ragService }),
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
    createStreamingModule(),
    createConversationsModule({
      retrieveContext: async (question, userId) => {
        const hits = await ragService.retrieve(question, userId);
        return applyCutoff(hits, config.rag.minScore).matched;
      },
    }),
  ];
}
