import { createObservabilityRouter } from "./router.js";
import { createTraceLog } from "./trace-log.js";

export function createObservabilityModule({ log = createTraceLog() } = {}) {
  return {
    id: "observability",
    name: "Observability",
    router: createObservabilityRouter(log),
    health() {
      return { traces: log.list().length };
    },
  };
}
