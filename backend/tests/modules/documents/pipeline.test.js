import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../../../src/app.js";
import { createDocumentPipelineModule } from "../../../src/modules/documents/index.js";
import { createRagService } from "../../../src/modules/rag/rag-service.js";
import { createMemoryStore } from "../../../src/modules/rag/store.js";

const KEYWORDS = ["gym", "pets", "vector", "ollama", "lantern", "maple"];

const fakeEmbeddings = {
  embedDocuments: async (texts) => texts.map(embedOne),
  embedQuery: async (text) => embedOne(text),
};

function embedOne(text) {
  const lower = text.toLowerCase();
  return [...KEYWORDS.map((word) => (lower.includes(word) ? 1 : 0)), 1];
}

function pipelineFor(dir) {
  const rag = createRagService({
    embeddings: fakeEmbeddings,
    llm: { invoke: async () => "unused" },
    corpusPath: dir,
    store: createMemoryStore(fakeEmbeddings),
    topK: 3,
    minScore: 0.51,
  });
  const app = createApp([
    createDocumentPipelineModule({
      listDocuments: (userId) => rag.listDocuments(userId),
      documentStatus: (filename, userId) => rag.documentStatus(filename, userId),
      acceptDocument: (input) => rag.acceptDocument(input),
      retryDocument: (filename, userId) => rag.retryDocument(filename, userId),
      removeDocument: (filename, userId) => rag.removeDocument(filename, userId),
    }),
  ]);
  return { app, rag };
}

describe("document pipeline", () => {
  it("queues an upload and then reports it ready", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pipeline-"));
    await fs.writeFile(path.join(dir, "knowledge.txt"), "The gym is on the 3rd floor.");
    const { app, rag } = pipelineFor(dir);
    await rag.ingest();

    const posted = await request(app)
      .post("/api/documents")
      .send({ filename: "parking.md", text: "The visitor parking code is maple-17." });
    expect(posted.status).toBe(202);
    expect(posted.body).toMatchObject({ filename: "parking.md", status: "queued" });

    await rag.whenIdle();
    const listed = await request(app).get("/api/documents");
    const parking = listed.body.documents.find((document) => document.name === "parking.md");
    const sample = listed.body.documents.find((document) => document.name === "knowledge.txt");
    expect(parking).toMatchObject({ status: "ready", shared: false, removable: true });
    expect(sample).toMatchObject({ status: "ready", shared: true, removable: false });
    expect(await fs.readFile(path.join(dir, "users", "local", "parking.md"), "utf-8")).toContain("maple-17");
  });

  it("hides a guest upload from local and rejects a bad file", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pipeline-users-"));
    await fs.writeFile(path.join(dir, "knowledge.txt"), "The gym is on the 3rd floor.");
    const { app, rag } = pipelineFor(dir);
    await rag.ingest();

    const uploaded = await request(app)
      .post("/api/documents")
      .set("X-User-Id", "guest")
      .send({ filename: "alice.md", text: "The visitor parking code is maple-17." });
    expect(uploaded.status).toBe(202);
    await rag.whenIdle();

    const local = await request(app).get("/api/documents");
    expect(local.body.documents.map((document) => document.name)).toEqual(["knowledge.txt"]);

    const guest = await request(app).get("/api/documents").set("X-User-Id", "guest");
    expect(guest.body.documents.map((document) => document.name)).toContain("alice.md");

    const removed = await request(app).delete("/api/documents/alice.md").set("X-User-Id", "guest");
    expect(removed.status).toBe(200);
    expect(removed.body.filename).toBe("alice.md");

    const empty = await request(app).post("/api/documents").send({ filename: "notes.md", text: "  " });
    expect(empty.status).toBe(400);

    const unknown = await request(app).get("/api/documents").set("X-User-Id", "bob");
    expect(unknown.status).toBe(400);
  });
});
