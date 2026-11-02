import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { formatSse } from "../../../src/core/sse.js";
import { DEFAULT_CORPUS, createRagService } from "../../../src/modules/rag/rag-service.js";

/**
 * Deterministic stand-in for a real embedding model: each text becomes a vector of
 * keyword counts, so similarity search is predictable and runs with no network.
 */
const KEYWORDS = ["gym", "pets", "vector", "ollama"];

const fakeEmbeddings = {
  embedDocuments: async (texts) => texts.map(embedOne),
  embedQuery: async (text) => embedOne(text),
};

function embedOne(text) {
  const lower = text.toLowerCase();
  // The trailing 1 keeps every vector non-zero; cosine similarity against an
  // all-zero vector is NaN, which real embedding models never produce.
  return [...KEYWORDS.map((word) => (lower.includes(word) ? 1 : 0)), 1];
}

function makeService(overrides = {}) {
  return createRagService({
    embeddings: fakeEmbeddings,
    llm: { invoke: vi.fn(async (prompt) => `PROMPT_LENGTH:${prompt.length}`) },
    corpusPath: DEFAULT_CORPUS,
    ...overrides,
  });
}

describe("createRagService", () => {
  it("ingests the corpus into chunks and reports how many", async () => {
    const rag = makeService();
    const count = await rag.ingest();

    expect(count).toBeGreaterThan(1);
    expect(rag.chunkCount).toBe(count);
  });

  it("does not duplicate chunks when ingesting twice", async () => {
    const rag = makeService();
    const first = await rag.ingest();
    const second = await rag.ingest();

    expect(second).toBe(first);
  });

  it("retrieves at most topK sources and scores each one", async () => {
    const rag = makeService({ topK: 2 });
    await rag.ingest();

    const { matchedSources } = await rag.ask("Where is the gym?");

    expect(matchedSources).toHaveLength(2);
    for (const source of matchedSources) {
      expect(Number(source.score)).not.toBeNaN();
    }
  });

  it("retrieves the chunk that actually mentions the query term", async () => {
    const rag = makeService({ topK: 1 });
    await rag.ingest();

    const { matchedSources } = await rag.ask("gym");

    expect(matchedSources[0].text.toLowerCase()).toContain("gym");
    expect(matchedSources[0].source).toBe("knowledge.txt");
  });

  it("drops weak chunks and does not call the model when nothing remains", async () => {
    const llm = { invoke: vi.fn(async () => "should not run") };
    const rag = makeService({ llm, minScore: 1.01 });
    await rag.ingest();

    const result = await rag.ask("Where is the gym?");

    expect(result.refused).toBe(true);
    expect(result.answer).toMatch(/don't know/);
    expect(result.matchedSources).toEqual([]);
    expect(result.droppedSources.length).toBeGreaterThan(0);
    expect(llm.invoke).not.toHaveBeenCalled();
  });

  it("keeps a strong match and still reports the weaker chunks as dropped", async () => {
    const rag = makeService({ minScore: 0.8, topK: 3 });
    await rag.ingest();

    const result = await rag.ask("gym");

    expect(result.refused).toBe(false);
    expect(result.matchedSources).toHaveLength(1);
    expect(result.matchedSources[0].text.toLowerCase()).toContain("gym");
    expect(result.droppedSources.length).toBeGreaterThan(0);
    for (const source of result.droppedSources) {
      expect(Number(source.score)).toBeLessThan(0.8);
    }
  });

  it("loads a matching chroma corpus without embedding again", async () => {
    const raw = await fs.readFile(DEFAULT_CORPUS, "utf-8");
    const corpusHash = createHash("sha256").update(raw).digest("hex");
    const store = {
      kind: "chroma",
      status: vi.fn(async () => ({ count: 6, corpusHash, space: "cosine" })),
      replace: vi.fn(),
      search: vi.fn(async () => []),
    };
    const rag = makeService({ store });

    const loaded = await rag.load();

    expect(loaded).toEqual({ chunks: 6, embedded: false, store: "chroma" });
    expect(store.replace).not.toHaveBeenCalled();
    expect(rag.chunkCount).toBe(6);
  });

  it("re-embeds when the stored corpus hash does not match", async () => {
    const store = {
      kind: "chroma",
      status: vi.fn(async () => ({ count: 6, corpusHash: "stale", space: "cosine" })),
      replace: vi.fn(async () => {}),
      search: vi.fn(async () => []),
    };
    const rag = makeService({ store });

    const loaded = await rag.load();

    expect(loaded.embedded).toBe(true);
    expect(store.replace).toHaveBeenCalledOnce();
  });

  it("streams tokens after sending the sources", async () => {
    const streamChat = vi.fn(async ({ onToken }) => {
      onToken("3rd");
      onToken(" floor");
    });
    const rag = makeService({ streamChat });
    await rag.ingest();
    const chunks = [];

    await rag.streamAnswer("gym", { write: (chunk) => chunks.push(chunk) });

    expect(chunks[0]).toContain("event: meta");
    expect(chunks[0]).toContain("knowledge.txt");
    expect(chunks.join("")).toContain(formatSse("token", { text: "3rd" }));
    expect(chunks.at(-1)).toContain('"finish":"stop"');
    expect(streamChat).toHaveBeenCalledOnce();
  });

  it("refuses a weak match in the stream without calling the model", async () => {
    const streamChat = vi.fn();
    const rag = makeService({ streamChat, minScore: 1.01 });
    await rag.ingest();
    const chunks = [];

    await rag.streamAnswer("Where is the gym?", { write: (chunk) => chunks.push(chunk) });

    expect(chunks.join("")).toContain("don't know");
    expect(chunks.at(-1)).toContain('"finish":"refused"');
    expect(streamChat).not.toHaveBeenCalled();
  });

  it("fails clearly when the corpus file is missing", async () => {
    const rag = makeService({ corpusPath: path.join("does", "not", "exist.txt") });
    await expect(rag.ingest()).rejects.toThrow(/ENOENT/);
  });
});
