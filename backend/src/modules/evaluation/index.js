import { createEvaluationRouter } from "./router.js";
import { createEvaluationService } from "./service.js";

export function createEvaluationModule({ run }) {
  const service = createEvaluationService({ run });
  return {
    id: "evaluation",
    name: "LLM Evaluation",
    router: createEvaluationRouter(service),
    health() {
      return { kind: "retrieval" };
    },
  };
}
