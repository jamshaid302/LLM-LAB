import { config } from "../../core/config.js";

import { createRagService } from "./rag-service.js";
import { createRagRouter } from "./router.js";

export function createRagModule({
  service = createRagService({ storeKind: config.rag.store }),
} = {}) {
  return {
    id: "rag",
    name: "RAG",
    router: createRagRouter(service),
    async init() {
      const result = await service.load();
      const action = result.embedded ? "embedded into" : "loaded from";
      return `${result.chunks} chunks ${action} ${result.store}`;
    },
    health() {
      return {
        chunks: service.chunkCount,
        minScore: service.minScore,
        store: service.storeKind,
        reranker: service.reranker,
      };
    },
  };
}
