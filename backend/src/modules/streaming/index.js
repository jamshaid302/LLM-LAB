import { config } from "../../core/config.js";

import { createStreamingRouter } from "./router.js";
import { createStreamingService } from "./service.js";

export function createStreamingModule({ service = createStreamingService() } = {}) {
  return {
    id: "streaming",
    name: "Streaming Chat",
    router: createStreamingRouter(service),
    health() {
      return { model: config.ollama.chatModel };
    },
  };
}
