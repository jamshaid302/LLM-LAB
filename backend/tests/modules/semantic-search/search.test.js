import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../../../src/app.js";
import { applyCutoff } from "../../../src/modules/rag/retrieval.js";
import { createRagService } from "../../../src/modules/rag/rag-service.js";
import { createMemoryStore } from "../../../src/modules/rag/store.js";
import { createSemanticSearchModule } from "../../../src/modules/semantic-search/index.js";

const KEYWORDS = ["gym", "pets", "vector", "ollama", "lantern", "maple"];

const fakeEmbeddings = {
  embedDocuments: async (texts) => texts.map(embedOne),
  embedQuery: async (text) => embedOne(text),
};

function embedOne(text) {
  const lower = text.toLowerCase();
  return [...KEYWORDS.map((word) => (lower.includes(word) ? 1 : 0)), 1];
}

function appFor(dir, { minScore = 0.51, topK = 3 } = {}) {
  const rag = createRagService({
    embeddings: fakeEmbeddings,
    llm: { invoke: async () => "the chat model must not run" },
    corpusPath: dir,
    store: createMemoryStore(fakeEmbeddings),
    topK,
    minScore,
  });
  const app = createApp([
    createSemanticSearchModule({
      minScore,
      search: async (question, userId) => applyCutoff(await rag.retrieve(question, userId), minScore),
    }),
  ]);
  return { app, rag };
}

describe("semantic search", () => {
  it("returns the nearest chunk and does not include an answer", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "search-"));
    await fs.writeFile(path.join(dir, "knowledge.txt"), "The gym is on the 3rd floor.");
    const { app, rag } = appFor(dir);
    await rag.ingest();

    const found = await request(app).post("/api/semantic-search/query").send({ query: "gym" });
    expect(found.status).toBe(200);
    expect(found.body.answer).toBeUndefined();
    expect(found.body.matched[0].source).toBe("knowledge.txt");
    expect(found.body.matched[0].text).toContain("gym");
    expect(Number(found.body.matched[0].score)).toBeGreaterThan(0.5);

    const weak = await request(app).post("/api/semantic-search/query").send({ query: "maple" });
    expect(weak.body.matched).toEqual([]);
    expect(weak.body.dropped[0].source).toBe("knowledge.txt");
  });

  it("searches shared files plus the selected person's files", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "search-users-"));
    await fs.writeFile(path.join(dir, "knowledge.txt"), "The gym is on the 3rd floor.");
    const { app, rag } = appFor(dir);
    await rag.ingest();
    await rag.addDocument({
      filename: "alice.md",
      text: "The visitor parking code is maple-17.",
      userId: "guest",
    });

    const guest = await request(app)
      .post("/api/semantic-search/query")
      .set("X-User-Id", "guest")
      .send({ query: "maple" });
    expect(guest.body.matched[0].source).toBe("alice.md");

    const local = await request(app).post("/api/semantic-search/query").send({ query: "maple" });
    expect(local.body.matched).toEqual([]);
    expect(local.body.dropped.every((hit) => hit.source !== "alice.md")).toBe(true);
  });

  it("rejects a blank query and an unknown user", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "search-bad-"));
    await fs.writeFile(path.join(dir, "knowledge.txt"), "The gym is on the 3rd floor.");
    const { app, rag } = appFor(dir);
    await rag.ingest();

    const blank = await request(app).post("/api/semantic-search/query").send({ query: "  " });
    expect(blank.status).toBe(400);

    const unknown = await request(app)
      .post("/api/semantic-search/query")
      .set("X-User-Id", "bob")
      .send({ query: "gym" });
    expect(unknown.status).toBe(400);
  });
});
