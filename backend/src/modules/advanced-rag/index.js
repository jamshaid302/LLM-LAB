import { createAdvancedRagRouter } from "./router.js";
import { createAdvancedRagService } from "./service.js";

export function createAdvancedRagModule(deps) {
  const service = createAdvancedRagService(deps);
  return {
    id: "advanced-rag",
    name: "Advanced RAG",
    router: createAdvancedRagRouter(service),
    health() {
      return { retriever: "vector" };
    },
  };
}
