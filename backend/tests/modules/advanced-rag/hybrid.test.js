import { describe, expect, it } from "vitest";
import request from "supertest";

import { createApp } from "../../../src/app.js";
import { createAdvancedRagModule } from "../../../src/modules/advanced-rag/index.js";
import { fuseRanks, hybridImproves, rankByBm25 } from "../../../src/modules/advanced-rag/hybrid.js";
import { scoreRetrieval } from "../../../src/modules/rag/retrieval.js";
import { createMemoryStore } from "../../../src/modules/rag/store.js";

const chunks = [
  { text: "The gym is on the 3rd floor.", source: "knowledge.txt", owner: "shared" },
  { text: "The server room access code is 4829.", source: "knowledge.txt", owner: "shared" },
];

describe("rankByBm25", () => {
  it("ranks the chunk that contains the rare term first", () => {
    const ranked = rankByBm25(chunks, "server room access code");
    expect(ranked[0].text).toContain("4829");
    expect(ranked.every((hit) => hit.keywordScore > 0)).toBe(true);
  });
});

describe("fuseRanks", () => {
  it("promotes a chunk the keyword list ranks first and keeps its cosine score", () => {
    const fused = fuseRanks(
      [
        [
          { text: "The gym is on the 3rd floor.", source: "knowledge.txt", score: 0.9 },
          { text: "The server room access code is 4829.", source: "knowledge.txt", score: 0.4 },
        ],
        [{ text: "The server room access code is 4829.", source: "knowledge.txt" }],
      ],
      { limit: 2 },
    );
    expect(fused[0].text).toContain("4829");
    expect(fused[0].score).toBe(0.4);
  });
});

describe("hybridImproves", () => {
  const base = {
    recallAtK: { before: 1, after: 1 },
    mrr: { before: 1, after: 1 },
    refusedByCutoff: 1,
  };

  it("rejects an equal result", () => {
    expect(hybridImproves(base, base)).toBe(false);
  });

  it("rejects a result that drops MRR", () => {
    expect(hybridImproves(base, { ...base, mrr: { before: 0.5, after: 1 } })).toBe(false);
  });

  it("accepts a higher recall that loses nothing else", () => {
    expect(
      hybridImproves(
        { ...base, recallAtK: { before: 0.5, after: 0.5 } },
        { ...base, recallAtK: { before: 1, after: 1 } },
      ),
    ).toBe(true);
  });
});

describe("POST /api/advanced-rag/compare", () => {
  function appWith({ searchWide, suite }) {
    return createApp([
      createAdvancedRagModule({
        k: 1,
        minScore: 0.5,
        candidateK: 2,
        searchWide,
        listChunks: async () => chunks,
        loadSuite: async () => suite,
        score: (items) => scoreRetrieval(items, { k: 1, minScore: 0.5 }),
      }),
    ]);
  }

  it("keeps hybrid when the keyword pass puts the answer inside k", async () => {
    const app = appWith({
      searchWide: async () => [
        { text: chunks[0].text, source: "knowledge.txt", score: 0.8 },
        { text: chunks[1].text, source: "knowledge.txt", score: 0.7 },
      ],
      suite: {
        answerable: [{ question: "4829", expect: "4829" }],
        unanswerable: [],
      },
    });

    const res = await request(app).post("/api/advanced-rag/compare");
    expect(res.status).toBe(200);
    expect(res.body.vector.recallAtK.after).toBe(0);
    expect(res.body.hybrid.recallAtK.after).toBe(1);
    expect(res.body.kept).toBe(true);
    expect(res.body.retriever).toBe("vector");
  });

  it("does not keep hybrid when the two lists agree", async () => {
    const hit = { text: chunks[0].text, source: "knowledge.txt", score: 0.8 };
    const app = appWith({
      searchWide: async () => [hit],
      suite: {
        answerable: [{ question: "Where is the company gym?", expect: "3rd floor" }],
        unanswerable: [{ question: "What is the capital of Brazil?" }],
      },
    });

    const res = await request(app).post("/api/advanced-rag/compare");
    expect(res.body.kept).toBe(false);
    expect(res.body.vector.recallAtK.after).toBe(1);
    expect(res.body.hybrid.recallAtK.after).toBe(1);
  });

  it("keeps the cross-encoder when it moves the answer inside k from the wide list", async () => {
    const app = createApp([
      createAdvancedRagModule({
        k: 1,
        minScore: 0.5,
        candidateK: 2,
        searchWide: async () => [
          { text: chunks[0].text, source: "knowledge.txt", score: 0.8 },
          { text: chunks[1].text, source: "knowledge.txt", score: 0.7 },
        ],
        listChunks: async () => chunks,
        loadSuite: async () => ({ answerable: [{ question: "access code", expect: "4829" }], unanswerable: [] }),
        score: (items) => scoreRetrieval(items, { k: 1, minScore: 0.5 }),
        crossEncoder: {
          model: "fake-cross-encoder",
          score: async (_query, texts) => texts.map((text) => (text.includes("4829") ? 9 : -9)),
        },
      }),
    ]);

    const res = await request(app).post("/api/advanced-rag/compare");
    expect(res.body.vector.recallAtK.after).toBe(0);
    expect(res.body.crossEncoder.recallAtK.after).toBe(1);
    expect(res.body.crossEncoderKept).toBe(true);
    expect(res.body.crossEncoderModel).toBe("fake-cross-encoder");
    expect(res.body.crossEncoderError).toBeNull();
  });

  it("reports why there is no cross-encoder score instead of failing the compare", async () => {
    const app = appWith({
      searchWide: async () => [{ text: chunks[0].text, source: "knowledge.txt", score: 0.8 }],
      suite: { answerable: [{ question: "gym", expect: "3rd floor" }], unanswerable: [] },
    });
    const res = await request(app).post("/api/advanced-rag/compare");
    expect(res.status).toBe(200);
    expect(res.body.crossEncoder).toBeNull();
    expect(res.body.crossEncoderKept).toBe(false);
    expect(res.body.crossEncoderError).toBe("No cross-encoder configured");
  });

  it("rejects an unknown user", async () => {
    const app = appWith({
      searchWide: async () => [],
      suite: { answerable: [], unanswerable: [] },
    });
    const res = await request(app).post("/api/advanced-rag/compare").set("X-User-Id", "bob");
    expect(res.status).toBe(400);
  });
});

describe("memory store list", () => {
  it("hides another person's chunk", async () => {
    const store = createMemoryStore({
      embedDocuments: async (texts) => texts.map(() => [1, 0]),
      embedQuery: async () => [1, 0],
    });
    await store.replace(
      [
        { pageContent: "shared gym", metadata: { source: "knowledge.txt", owner: "shared" } },
        { pageContent: "guest maple", metadata: { source: "alice.md", owner: "guest" } },
      ],
      { corpusHash: "one" },
    );
    const local = await store.list("local");
    expect(local.map((chunk) => chunk.text)).toEqual(["shared gym"]);
  });
});
