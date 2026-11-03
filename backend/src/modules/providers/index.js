import { createProvidersRouter } from "./router.js";
import { createProviderService } from "./service.js";

export function createProvidersModule({ service = createProviderService() } = {}) {
  return {
    id: "providers",
    name: "Providers & Cost",
    router: createProvidersRouter(service),
    health() {
      return { provider: "ollama", models: service.listModels().models.length };
    },
  };
}
