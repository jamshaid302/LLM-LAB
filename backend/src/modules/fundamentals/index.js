import { config } from "../../core/config.js";

import { createChatRunner } from "./complete.js";
import { createFundamentalsRouter } from "./router.js";

export function createFundamentalsModule({
  runner = createChatRunner(),
  complete,
  comparePatterns,
  extractStructured,
} = {}) {
  const chat = {
    complete: complete ?? runner.complete,
    comparePatterns: comparePatterns ?? runner.comparePatterns,
    extractStructured: extractStructured ?? runner.extractStructured,
  };

  return {
    id: "fundamentals",
    name: "LLM Fundamentals",
    router: createFundamentalsRouter(chat),
    health() {
      return { model: config.ollama.chatModel };
    },
  };
}
