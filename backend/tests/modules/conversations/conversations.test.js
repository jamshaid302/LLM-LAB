import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../../../src/app.js";
import { createConversationsModule } from "../../../src/modules/conversations/index.js";
import { createMemoryConversationStore } from "../../../src/modules/conversations/memory-store.js";
import { buildConversationMessages, chooseFold, recentTurns } from "../../../src/modules/conversations/prompt.js";
import { createConversationService } from "../../../src/modules/conversations/service.js";

describe("conversation prompt", () => {
  it("keeps the newest turns and starts on a user message", () => {
    const messages = [
      { role: "user", content: "one" },
      { role: "assistant", content: "two" },
      { role: "user", content: "three" },
      { role: "assistant", content: "four" },
    ];
    expect(recentTurns(messages, 3).map((message) => message.content)).toEqual(["three", "four"]);
  });

  it("puts saved turns and retrieved documents into the next prompt", () => {
    const messages = buildConversationMessages({
      history: [
        { role: "user", content: "My name is Sam." },
        { role: "assistant", content: "Hi Sam." },
        { role: "user", content: "Where is the gym?" },
      ],
      docs: [{ text: "The gym is on the 3rd floor.", source: "knowledge.txt" }],
    });

    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("knowledge.txt");
    expect(messages[0].content).toContain("3rd floor");
    expect(messages.map((message) => message.content)).toContain("My name is Sam.");
    expect(messages.at(-1).content).toBe("Where is the gym?");
  });

  it("includes a saved summary and leaves folded messages out of the transcript", () => {
    const messages = buildConversationMessages({
      history: [{ role: "user", content: "What is my name?" }],
      summary: "The user's name is Sam.",
    });
    expect(messages[0].content).toContain("The user's name is Sam.");
    expect(messages.map((message) => message.content)).not.toContain("My name is Sam.");
  });

  it("folds the older half once the pending messages pass the limit", () => {
    const messages = [
      { role: "user", content: "one" },
      { role: "assistant", content: "two" },
      { role: "user", content: "three" },
    ];
    const fold = chooseFold({ messages, summarizedCount: 0, limit: 2 });
    expect(fold.toFold.map((message) => message.content)).toEqual(["one", "two"]);
    expect(fold.recent.map((message) => message.content)).toEqual(["three"]);
    expect(fold.summarizedCount).toBe(2);
  });
});

describe("conversation service", () => {
  it("saves both turns and feeds the saved reply into the next prompt", async () => {
    const store = createMemoryConversationStore();
    const seen = [];
    const service = createConversationService({
      store,
      retrieveContext: async () => [{ text: "Gym on the 3rd floor.", source: "knowledge.txt", score: 0.8 }],
      streamChat: async ({ messages, onToken }) => {
        seen.push(messages);
        onToken("Noted.");
      },
    });

    const thread = await service.createThread();
    const chunks = [];
    await service.streamReply({
      threadId: thread.id,
      message: "My name is Sam.",
      write: (chunk) => chunks.push(chunk),
    });
    await service.streamReply({
      threadId: thread.id,
      message: "What is my name?",
      write: () => {},
    });

    const saved = await service.listMessages(thread.id);
    expect(saved.messages.map((message) => message.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(saved.messages[1].content).toBe("Noted.");
    expect(saved.summary).toBe("");
    expect(seen[1].map((message) => message.content)).toContain("My name is Sam.");
    expect(seen[1].map((message) => message.content)).toContain("Noted.");
    expect(seen[1][0].content).toContain("knowledge.txt");
    expect(chunks[0]).toContain("event: meta");
    expect((await service.listThreads())[0].title).toBe("My name is Sam.");
  });

  it("saves a partial reply when the stream is stopped", async () => {
    const store = createMemoryConversationStore();
    const service = createConversationService({
      store,
      streamChat: async ({ onToken, signal }) => {
        onToken("partial");
        signal?.throwIfAborted?.();
        throw Object.assign(new Error("stopped"), { name: "AbortError" });
      },
    });
    const thread = await service.createThread();
    const controller = new AbortController();
    controller.abort();

    await service.streamReply({
      threadId: thread.id,
      message: "Keep going",
      signal: controller.signal,
      write: () => {},
    });

    const saved = await service.listMessages(thread.id);
    expect(saved.messages[1]).toMatchObject({ role: "assistant", content: "partial", stopped: true });
  });

  it("summarizes messages that no longer fit and does not summarize them again", async () => {
    const store = createMemoryConversationStore();
    const summarized = [];
    const seen = [];
    const service = createConversationService({
      store,
      historyLimit: 2,
      retrieveContext: async () => [],
      completeChat: async (messages) => {
        summarized.push(messages.at(-1).content);
        return "The user's name is Sam.";
      },
      streamChat: async ({ messages, onToken }) => {
        seen.push(messages);
        onToken("ok");
      },
    });

    const thread = await service.createThread();
    await service.streamReply({ threadId: thread.id, message: "My name is Sam.", write: () => {} });
    await service.streamReply({ threadId: thread.id, message: "What is my name?", write: () => {} });

    expect(summarized).toHaveLength(1);
    expect(summarized[0]).toContain("My name is Sam.");
    expect(seen.at(-1)[0].content).toContain("The user's name is Sam.");
    expect(seen.at(-1).map((message) => message.content)).not.toContain("My name is Sam.");

    await service.streamReply({ threadId: thread.id, message: "Thanks.", write: () => {} });
    expect(summarized).toHaveLength(2);
    expect(summarized[1]).toContain("Summary so far:");
    expect(summarized[1]).toContain("The user's name is Sam.");
    expect(summarized[1]).not.toContain("User: My name is Sam.");

    const saved = await service.listMessages(thread.id);
    expect(saved.messages).toHaveLength(6);
    expect(saved.summary).toBe("The user's name is Sam.");
    expect(saved.summarizedCount).toBeGreaterThan(0);
  });
});

describe("conversation routes", () => {
  it("returns 404 for an unknown thread and 400 for an empty message", async () => {
    const service = createConversationService({ store: createMemoryConversationStore() });
    const app = createApp([createConversationsModule({ service })]);

    const missing = await request(app).get("/api/conversations/threads/nope/messages");
    expect(missing.status).toBe(404);

    const thread = await request(app).post("/api/conversations/threads");
    const empty = await request(app)
      .post(`/api/conversations/threads/${thread.body.id}/stream`)
      .send({ message: "  " });
    expect(empty.status).toBe(400);
  });
});
