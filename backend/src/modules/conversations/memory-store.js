import { hasOwner } from "../../utils/generals";

/** In-memory stand-in for the Mongo collections. Tests use this. Nothing is written to disk. */
export function createMemoryConversationStore() {
  const threads = [];
  const messages = [];
  let sequence = 0;

  function nextId(prefix) {
    sequence += 1;
    return `${prefix}-${sequence}`;
  }

  return {
    async createThread({ userId, title = "New chat" }) {
      if (!hasOwner(userId))
        throw new Error("Conversation store requires a non-empty userId");

      const now = new Date().toISOString();
      const thread = {
        id: nextId("thread"),
        userId,
        title,
        summary: "",
        summarizedCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      threads.push(thread);
      return { ...thread };
    },

    async listThreads(userId) {
      if (!hasOwner(userId)) return [];

      return threads
        .filter((thread) => thread.userId === userId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((thread) => ({ ...thread }));
    },

    async getThread(id, userId) {
      if (typeof id !== "string" || !id || !hasOwner(userId)) return null;

      const thread = threads.find(
        (item) => item.id === id && item.userId === userId,
      );

      return thread ? { ...thread } : null;
    },

    async addMessage({ threadId, userId, role, content, stopped = false }) {
      if (typeof threadId !== "string" || !threadId || !hasOwner(userId))
        return null;

      const thread = threads.find(
        (item) => item.id === threadId && item.userId === userId,
      );

      if (!thread) return null;
      const now = new Date().toISOString();
      const message = {
        id: nextId("message"),
        threadId,
        userId,
        role,
        content,
        stopped,
        createdAt: now,
      };
      messages.push(message);
      thread.updatedAt = now;

      if (role === "user" && thread.title === "New chat") {
        thread.title = content.slice(0, 48);
      }

      return presentMessage(message);
    },

    async updateSummary(threadId, { userId, summary, summarizedCount }) {
      if (typeof threadId !== "string" || !threadId || !hasOwner(userId))
        return null;

      const thread = threads.find(
        (item) => item.id === threadId && item.userId === userId,
      );

      if (!thread) return null;
      thread.summary = summary;
      thread.summarizedCount = summarizedCount;
      thread.updatedAt = new Date().toISOString();
      return { ...thread };
    },

    async listMessages(threadId, userId) {
      if (typeof threadId !== "string" || !threadId || !hasOwner(userId))
        return [];

      return messages
        .filter(
          (message) =>
            message.threadId === threadId && message.userId === userId,
        )
        .sort(
          (a, b) =>
            a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
        )
        .map(presentMessage);
    },
  };
}

function presentMessage(message) {
  return {
    id: message.id,
    threadId: message.threadId,
    role: message.role,
    content: message.content,
    stopped: message.stopped,
    createdAt: message.createdAt,
  };
}
