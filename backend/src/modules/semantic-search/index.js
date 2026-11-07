import { createSemanticSearchRouter } from "./router.js";
import { createSemanticSearchService } from "./service.js";

export function createSemanticSearchModule({ search, minScore }) {
  const service = createSemanticSearchService({ search, minScore });
  return {
    id: "semantic-search",
    name: "Semantic Search",
    router: createSemanticSearchRouter(service),
    health() {
      return { minScore: service.minScore };
    },
  };
}
