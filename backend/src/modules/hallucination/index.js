import { createHallucinationRouter } from "./router.js";
import { createHallucinationService } from "./service.js";

export function createHallucinationModule({ ask }) {
  const service = createHallucinationService({ ask });
  return {
    id: "hallucination",
    name: "Hallucination Detection",
    router: createHallucinationRouter(service),
    health() {
      return { check: "grounding" };
    },
  };
}
