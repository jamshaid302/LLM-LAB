import { config } from "../../core/config.js";

import { connectMongo } from "./mongo-store.js";
import { createConversationsRouter } from "./router.js";
import { createConversationService } from "./service.js";

export function createConversationsModule({
  service,
  retrieveContext,
  connect = connectMongo,
} = {}) {
  const box = { store: null };

  const active =
    service ??
    createConversationService({
      getStore: () => box.store,
      retrieveContext,
    });

  return {
    id: "conversations",
    name: "Conversations",
    router: createConversationsRouter(active),
    async init() {
      if (service) return "using injected store";
      box.store = await connect();
      const threads = await box.store.listThreads(config.conversations.userId);
      return `connected, ${threads.length} threads`;
    },
    health() {
      return { store: box.store || service ? "up" : "down" };
    },
  };
}
