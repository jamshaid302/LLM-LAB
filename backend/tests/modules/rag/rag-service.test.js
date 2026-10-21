import path from "node:path";

import { describe, expect, it, vi } from "vitest";

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
  });

  it("fails clearly when the corpus file is missing", async () => {
    const rag = makeService({ corpusPath: path.join("does", "not", "exist.txt") });
    await expect(rag.ingest()).rejects.toThrow(/ENOENT/);
  });
});
