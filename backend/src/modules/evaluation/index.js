import { createEvaluationRouter } from "./router.js";
import { createEvaluationService } from "./service.js";

export function createEvaluationModule({ run, loadBaseline }) {
  const service = createEvaluationService({ run, loadBaseline });
  return {
    id: "evaluation",
    name: "LLM Evaluation",
    router: createEvaluationRouter(service),
    health() {
      return { kind: "retrieval", baseline: typeof loadBaseline === "function" ? "committed" : "none" };
    },
  };
}
