import { createAgentsRouter } from "./router.js";
import { createAgentsService } from "./service.js";
import { TOOL_NAME } from "./loop.js";

export function createAgentsModule(options) {
  const service = createAgentsService(options);
  return {
    id: "agents",
    name: "AI Agents",
    router: createAgentsRouter(service),
    health() {
      return { tool: TOOL_NAME, maxSteps: service.maxSteps, model: service.model };
    },
  };
}
