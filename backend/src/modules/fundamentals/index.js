import { config } from "../../core/config.js";

import { createCompleter } from "./complete.js";
import { createFundamentalsRouter } from "./router.js";

export function createFundamentalsModule({ complete = createCompleter() } = {}) {
  return {
    id: "fundamentals",
    name: "LLM Fundamentals",
    router: createFundamentalsRouter(complete),
    health() {
      return { model: config.ollama.chatModel };
    },
  };
}
