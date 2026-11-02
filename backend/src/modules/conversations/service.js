import { config } from "../../core/config.js";
import { HttpError } from "../../core/http.js";
import { completeOllamaChat, streamOllamaChat } from "../../core/ollama-stream.js";
import { formatSse, isAbortError } from "../../core/sse.js";

import { buildConversationMessages, buildSummaryMessages, chooseFold } from "./prompt.js";

const MAX_MESSAGE = 4000;

export function createConversationService({
  store,
  getStore,
  streamChat = (args) =>
    streamOllamaChat({
      baseUrl: config.ollama.baseUrl,
      model: config.ollama.chatModel,
      ...args,
    }),
  completeChat = (messages) =>
    completeOllamaChat({
      baseUrl: config.ollama.baseUrl,
      model: config.ollama.chatModel,
      messages,
    }),
  retrieveContext = async () => [],
  userId = config.conversations.userId,
  historyLimit = config.conversations.historyLimit,
} = {}) {
  function requireStore() {
    const current = getStore ? getStore() : store;
    if (!current) {
      throw new HttpError(503, "MongoDB is not connected. From backend/, run: docker compose up -d");
    }
    return current;
  }

  async function createThread() {
    return requireStore().createThread({ userId });
  }

  async function listThreads() {
    return requireStore().listThreads(userId);
  }

  async function listMessages(threadId) {
    const thread = await requireStore().getThread(threadId);
    if (!thread || thread.userId !== userId) throw new HttpError(404, "Thread not found");
    return {
      messages: await requireStore().listMessages(threadId),
      summary: thread.summary ?? "",
      summarizedCount: thread.summarizedCount ?? 0,
    };
  }

  async function streamReply({ threadId, message, signal, write }) {
    const text = typeof message === "string" ? message.trim() : "";
    if (!text) throw new HttpError(400, "Missing 'message'");
    if (text.length > MAX_MESSAGE) {
      throw new HttpError(400, `Message must be at most ${MAX_MESSAGE} characters`);
    }

    const db = requireStore();
    const thread = await db.getThread(threadId);
    if (!thread || thread.userId !== userId) throw new HttpError(404, "Thread not found");

    await db.addMessage({ threadId, role: "user", content: text });
    const history = await prepareHistory({ db, thread, threadId });
    const docs = await retrieveContext(text);
    const prompt = buildConversationMessages({
      history: history.recent,
      docs,
      summary: history.summary,
    });

    write(
      formatSse("meta", {
        summary: history.summary,
        summarizedCount: history.summarizedCount,
        sources: (docs ?? []).map((doc) => ({
          text: doc.text,
          source: doc.source,
          score: Number(doc.score).toFixed(3),
        })),
      }),
    );

    let answer = "";
    let stopped = false;
    try {
      await streamChat({
        messages: prompt,
        signal,
        onToken(token) {
          answer += token;
          write(formatSse("token", { text: token }));
        },
      });
    } catch (err) {
      if (!isAbortError(err) && !signal?.aborted) throw err;
      stopped = true;
    }

    if (answer) {
      await db.addMessage({ threadId, role: "assistant", content: answer, stopped });
    }
    write(formatSse("done", { finish: stopped ? "stopped" : "stop" }));
  }

  async function prepareHistory({ db, thread, threadId }) {
    const messages = await db.listMessages(threadId);
    const fold = chooseFold({
      messages,
      summarizedCount: thread.summarizedCount ?? 0,
      limit: historyLimit,
    });

    if (fold.toFold.length === 0) {
      return {
        recent: fold.recent,
        summary: thread.summary ?? "",
        summarizedCount: thread.summarizedCount ?? 0,
      };
    }

    const summary = (await completeChat(buildSummaryMessages({
      previousSummary: thread.summary ?? "",
      messages: fold.toFold,
    }))).trim();
    if (!summary) throw new Error("The conversation summary came back empty");

    await db.updateSummary(threadId, { summary, summarizedCount: fold.summarizedCount });
    return { recent: fold.recent, summary, summarizedCount: fold.summarizedCount };
  }

  return { createThread, listThreads, listMessages, streamReply };
}
