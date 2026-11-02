import { describe, expect, it } from "vitest";

import {
  chromaClientArgs,
  createChromaStore,
  createMemoryStore,
  createVectorStore,
  similarityFromCosineDistance,
} from "../../../src/modules/rag/store.js";

const embeddings = {
  embedDocuments: async (texts) => texts.map((_, index) => [index + 1, 0]),
  embedQuery: async () => [1, 0],
};

function fakeChroma() {
  const collections = new Map();

  function build(name, metadata) {
    const records = [];
    const collection = {
      name,
      metadata,
      configuration: { hnsw: { space: metadata?.space ?? "cosine" } },
      async count() {
        return records.length;
      },
      async add({ ids, documents, metadatas, embeddings: vectors }) {
        for (let i = 0; i < ids.length; i += 1) {
          records.push({
            document: documents[i],
            metadata: metadatas[i],
            embedding: vectors[i],
          });
        }
      },
      async query({ nResults }) {
        const slice = records.slice(0, nResults);
        return {
          documents: [slice.map((record) => record.document)],
          metadatas: [slice.map((record) => record.metadata)],
          distances: [slice.map(() => 0.226)],
        };
      },
    };
    collections.set(name, collection);
    return collection;
  }

  return {
    async listCollections() {
      return [...collections.values()];
    },
    async deleteCollection({ name }) {
      collections.delete(name);
    },
    async createCollection({ name, metadata }) {
      return build(name, metadata);
    },
    async getOrCreateCollection({ name }) {
      return collections.get(name) ?? build(name, {});
    },
  };
}

describe("similarityFromCosineDistance", () => {
  it("turns Chroma cosine distance back into similarity", () => {
    expect(similarityFromCosineDistance(0)).toBe(1);
    expect(similarityFromCosineDistance(0.226)).toBeCloseTo(0.774);
  });

  it("rejects a missing distance", () => {
    expect(() => similarityFromCosineDistance(undefined)).toThrow(/non-numeric/);
  });
});

describe("chromaClientArgs", () => {
  it("reads host and port from the URL", () => {
    expect(chromaClientArgs("http://localhost:8000")).toEqual({
      ssl: false,
      host: "localhost",
      port: 8000,
    });
  });
});

describe("createVectorStore", () => {
  it("rejects an unknown store name", () => {
    expect(() => createVectorStore({ kind: "faiss", embeddings })).toThrow(/memory" or "chroma/);
  });
});

describe("createMemoryStore", () => {
  it("replaces documents instead of appending them", async () => {
    const store = createMemoryStore(embeddings);
    await store.replace(
      [
        { pageContent: "gym on the third floor", metadata: { source: "knowledge.txt" } },
        { pageContent: "pets on friday", metadata: { source: "knowledge.txt" } },
      ],
      { corpusHash: "one" },
    );
    await store.replace(
      [{ pageContent: "only the gym", metadata: { source: "knowledge.txt" } }],
      { corpusHash: "two" },
    );

    const status = await store.status();
    expect(status.count).toBe(1);
    expect(status.corpusHash).toBe("two");

    const hits = await store.search("gym", 1);
    expect(hits[0].text).toContain("gym");
    expect(hits[0].source).toBe("knowledge.txt");
  });
});

describe("createChromaStore", () => {
  it("converts distance to similarity and replaces the collection", async () => {
    const client = fakeChroma();
    const store = createChromaStore({
      embeddings,
      url: "http://localhost:8000",
      client,
    });

    await store.replace(
      [
        { pageContent: "gym", metadata: { source: "knowledge.txt" } },
        { pageContent: "pets", metadata: { source: "knowledge.txt" } },
      ],
      { corpusHash: "abc" },
    );
    await store.replace(
      [{ pageContent: "gym only", metadata: { source: "knowledge.txt" } }],
      { corpusHash: "def" },
    );

    const status = await store.status();
    expect(status.count).toBe(1);
    expect(status.corpusHash).toBe("def");
    expect(status.space).toBe("cosine");

    const hits = await store.search("where is the gym", 1);
    expect(hits).toEqual([
      { text: "gym only", score: similarityFromCosineDistance(0.226), source: "knowledge.txt" },
    ]);
  });
});
