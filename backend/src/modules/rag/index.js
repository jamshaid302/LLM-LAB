import { createRagService } from "./rag-service.js";
import { createRagRouter } from "./router.js";

export function createRagModule({ service = createRagService() } = {}) {
  return {
    id: "rag",
    name: "RAG",
    router: createRagRouter(service),
    async init() {
      const chunks = await service.ingest();
      return `${chunks} chunks embedded`;
    },
    health() {
      return { chunks: service.chunkCount };
    },
  };
}
