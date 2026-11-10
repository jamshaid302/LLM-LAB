import { ChromaClient } from "chromadb";
import { afterAll, describe, expect, it } from "vitest";

import { config } from "../../src/core/config.js";
import { chromaClientArgs, createChromaStore } from "../../src/modules/rag/store.js";

import { keywordEmbeddings } from "./helpers.js";

const collectionName = `lab-live-owners-${Date.now()}`;
const client = new ChromaClient(chromaClientArgs(config.rag.chromaUrl));
const store = createChromaStore({ embeddings: keywordEmbeddings(), url: config.rag.chromaUrl, collectionName, client });

const chunks = [
  { pageContent: "The shared gym is on the 3rd floor.", metadata: { source: "knowledge.txt", owner: "shared" } },
  { pageContent: "Local's maple code is 1111.", metadata: { source: "notes.md", owner: "local" } },
  { pageContent: "Guest's birch code is 2222.", metadata: { source: "notes.md", owner: "guest" } },
];

afterAll(async () => {
  await client.deleteCollection({ name: collectionName }).catch(() => {});
});

describe("Chroma owner filter against the running server", () => {
  it("stores chunks with owner metadata in a cosine collection", async () => {
    await store.replace(chunks, { corpusHash: "live-1" });
    const status = await store.status();
    expect(status.count).toBe(3);
    expect(status.space).toBe("cosine");
    expect(status.corpusHash).toBe("live-1");
  });

  it("returns a person's own chunk to that person", async () => {
    const hits = await store.search("maple", 1, "local");
    expect(hits[0].text).toContain("maple");
    expect(hits[0].owner).toBe("local");
  });

  it("filters before top-k, so another person's nearest chunk never takes the slot", async () => {
    const hits = await store.search("maple", 1, "guest");
    expect(hits).toHaveLength(1);
    expect(hits[0].text).not.toContain("maple");
  });

  it("lists only shared chunks and the person's own", async () => {
    const listed = await store.list("guest");
    const owners = listed.map((chunk) => chunk.owner).sort();
    expect(owners).toEqual(["guest", "shared"]);
  });

  it("replaces one person's file without touching the other person's file of the same name", async () => {
    await store.upsertSource(
      [{ pageContent: "Local's maple code is now 3333.", metadata: { source: "notes.md", owner: "local" } }],
      { source: "notes.md", owner: "local", corpusHash: "live-2" },
    );
    const local = await store.search("maple", 1, "local");
    expect(local[0].text).toContain("3333");
    const guest = await store.list("guest");
    expect(guest.some((chunk) => chunk.text.includes("2222"))).toBe(true);
  });

  it("removes one person's file", async () => {
    await store.removeSource("notes.md", { owner: "local", corpusHash: "live-3" });
    const listed = await store.list("local");
    expect(listed.map((chunk) => chunk.owner)).toEqual(["shared"]);
    expect((await store.status()).count).toBe(2);
  });
});
