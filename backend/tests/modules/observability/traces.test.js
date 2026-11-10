import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../../../src/app.js";
import { createObservabilityModule } from "../../../src/modules/observability/index.js";
import { createTraceLog } from "../../../src/modules/observability/trace-log.js";
import { createRagService } from "../../../src/modules/rag/rag-service.js";
import { createMemoryStore } from "../../../src/modules/rag/store.js";
import { createStreamingService } from "../../../src/modules/streaming/service.js";
import { createStreamingRouter } from "../../../src/modules/streaming/router.js";

const fakeEmbeddings = {
  embedDocuments: async (texts) => texts.map(embedOne),
  embedQuery: async (text) => embedOne(text),
};

function embedOne(text) {
  const lower = text.toLowerCase();
  const keywords = ["gym", "maple"];
  return [...keywords.map((word) => (lower.includes(word) ? 1 : 0)), 1];
}

describe("trace log", () => {
  it("lists the newest trace first and keeps source names without the chunk text", () => {
    const log = createTraceLog();
    log.add({ route: "rag.ask", sources: [{ source: "knowledge.txt", score: "0.774", text: "secret gym sentence" }] });
    log.add({ route: "streaming.chat" });
    const traces = log.list();
    expect(traces.map((trace) => trace.route)).toEqual(["streaming.chat", "rag.ask"]);
    expect(traces[1].sources).toEqual([{ source: "knowledge.txt", score: "0.774" }]);
    expect(JSON.stringify(traces)).not.toContain("secret gym sentence");
  });

  it("keeps whether the reranker ran, how long it took, and why it failed", () => {
    const log = createTraceLog();
    log.add({ route: "rag.ask", reranked: true, rerankMs: 1100, rerankError: null });
    log.add({ route: "rag.ask", reranked: false, rerankMs: 3, rerankError: "model download failed" });
    log.add({ route: "streaming.chat" });
    const [chat, failed, ok] = log.list();
    expect(ok).toMatchObject({ reranked: true, rerankMs: 1100, rerankError: null });
    expect(failed).toMatchObject({ reranked: false, rerankError: "model download failed" });
    expect(chat).toMatchObject({ reranked: null, rerankMs: null });
  });
});

describe("request traces", () => {
  it("records a refused RAG ask before the model, and a chat call with token counts", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "trace-"));
    await fs.writeFile(path.join(dir, "knowledge.txt"), "The gym is on the 3rd floor.");
    const log = createTraceLog();
    const invoke = vi.fn(async () => "unused");
    const rag = createRagService({
      embeddings: fakeEmbeddings,
      llm: { invoke },
      corpusPath: dir,
      store: createMemoryStore(fakeEmbeddings),
      topK: 1,
      minScore: 0.51,
      trace: (entry) => log.add(entry),
    });
    await rag.ingest();

    const missed = await rag.ask("maple");
    expect(missed.refused).toBe(true);
    expect(invoke).not.toHaveBeenCalled();

    const streaming = createStreamingRouter(
      createStreamingService({
        trace: (entry) => log.add(entry),
        streamChat: async () => ({ promptTokens: 4, completionTokens: 1 }),
      }),
    );
    const app = createApp([createObservabilityModule({ log }), { id: "streaming", name: "Streaming Chat", router: streaming }]);
    const chat = await request(app).post("/api/streaming/chat").send({ message: "ping" });
    expect(chat.status).toBe(200);

    const listed = await request(app).get("/api/observability/traces");
    expect(listed.body.traces.map((trace) => trace.route)).toEqual(["streaming.chat", "rag.ask"]);
    expect(listed.body.traces[0]).toMatchObject({
      promptTokens: 4,
      completionTokens: 1,
      retrievalMs: null,
      refused: false,
    });
    expect(listed.body.traces[1]).toMatchObject({
      route: "rag.ask",
      refused: true,
      generationMs: null,
      sources: [],
    });
    expect(typeof listed.body.traces[1].retrievalMs).toBe("number");
  });
});
