import { createDocumentPipelineRouter } from "./router.js";
import { createDocumentPipelineService } from "./service.js";

export function createDocumentPipelineModule(deps) {
  const service = createDocumentPipelineService(deps);
  return {
    id: "documents",
    name: "Document Pipeline",
    router: createDocumentPipelineRouter(service),
    health() {
      return { queue: "memory" };
    },
  };
}
