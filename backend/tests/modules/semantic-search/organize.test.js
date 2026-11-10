import { describe, expect, it } from "vitest";

import { organizeHits } from "../../../src/modules/semantic-search/organize.js";

describe("organizeHits", () => {
  it("separates a repeated chunk, groups a file, and keeps three related misses", () => {
    const organized = organizeHits(
      [
        { text: "The gym is on the 3rd floor.", source: "knowledge.txt", score: 0.8 },
        { text: "The gym is on the 3rd floor.", source: "knowledge.txt", score: 0.7 },
        { text: "Pets need a leash.", source: "office.txt", score: 0.6 },
      ],
      [
        { text: "one", source: "a.txt" },
        { text: "two", source: "b.txt" },
        { text: "three", source: "c.txt" },
        { text: "four", source: "d.txt" },
      ],
    );

    expect(organized.matched).toHaveLength(2);
    expect(organized.duplicates).toHaveLength(1);
    expect(organized.clusters).toEqual([
      { source: "knowledge.txt", count: 1 },
      { source: "office.txt", count: 1 },
    ]);
    expect(organized.related.map((hit) => hit.text)).toEqual(["one", "two", "three"]);
  });
});
