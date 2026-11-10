import { describe, expect, it } from "vitest";

import { rerankByOverlap, withParentText } from "../../../src/modules/advanced-rag/expand.js";

describe("rerank and parent text", () => {
  const hits = [
    { text: "The gym is on the 3rd floor.", source: "knowledge.txt", score: 0.9 },
    { text: "The server room access code is 4829.", source: "knowledge.txt", score: 0.4 },
  ];

  it("puts the chunk that shares more question words first and keeps the cosine score", () => {
    const ranked = rerankByOverlap(hits, "server room access code");
    expect(ranked[0].text).toContain("4829");
    expect(ranked[0].score).toBe(0.4);
  });

  it("joins every chunk from the same file onto the hit and keeps the score", () => {
    const [parent] = withParentText([hits[0]], hits);
    expect(parent.score).toBe(0.9);
    expect(parent.text).toContain("3rd floor");
    expect(parent.text).toContain("4829");
  });
});
