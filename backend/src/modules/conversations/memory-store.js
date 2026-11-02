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
      return thread;
    },

    async listThreads(userId) {
      return threads
        .filter((thread) => thread.userId === userId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((thread) => ({ ...thread }));
    },

    async getThread(id) {
      const thread = threads.find((item) => item.id === id);
      return thread ? { ...thread } : null;
    },

    async addMessage({ threadId, role, content, stopped = false }) {
      const thread = threads.find((item) => item.id === threadId);
      if (!thread) return null;
      const now = new Date().toISOString();
      const message = { id: nextId("message"), threadId, role, content, stopped, createdAt: now };
      messages.push(message);
      thread.updatedAt = now;
      if (role === "user" && thread.title === "New chat") {
        thread.title = content.slice(0, 48);
      }
      return { ...message };
    },

    async updateSummary(threadId, { summary, summarizedCount }) {
      const thread = threads.find((item) => item.id === threadId);
      if (!thread) return null;
      thread.summary = summary;
      thread.summarizedCount = summarizedCount;
      thread.updatedAt = new Date().toISOString();
      return { ...thread };
    },

    async listMessages(threadId) {
      return messages
        .filter((message) => message.threadId === threadId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
        .map((message) => ({ ...message }));
    },
  };
}
