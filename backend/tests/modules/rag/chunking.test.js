import { describe, expect, it } from "vitest";

import { createSplitter, splitText } from "../../../src/modules/rag/chunking.js";

const longText = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} about RAG.`).join(" ");

describe("createSplitter", () => {
  it("rejects an overlap that is not smaller than the chunk size", () => {
    expect(() => createSplitter({ chunkSize: 100, chunkOverlap: 100 })).toThrow(/must be smaller/);
  });
});

describe("splitText", () => {
  it("produces multiple chunks for text longer than the chunk size", async () => {
    const chunks = await splitText(longText, { chunkSize: 100, chunkOverlap: 20 });
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("keeps chunks near the requested size", async () => {
    const chunks = await splitText(longText, { chunkSize: 100, chunkOverlap: 20 });
    for (const chunk of chunks) {
      expect(chunk.pageContent.length).toBeLessThanOrEqual(100);
    }
  });

  it("returns a single chunk when the text is shorter than the chunk size", async () => {
    const chunks = await splitText("Short text.", { chunkSize: 400, chunkOverlap: 50 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].pageContent).toBe("Short text.");
  });
});
