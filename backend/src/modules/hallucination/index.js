import { createHallucinationRouter } from "./router.js";
import { createHallucinationService } from "./service.js";

export function createHallucinationModule({ ask, complete, labelFor }) {
  const service = createHallucinationService({ ask, complete, labelFor });
  return {
    id: "hallucination",
    name: "Hallucination Detection",
    router: createHallucinationRouter(service),
    health() {
      return { check: "grounding" };
    },
  };
}
