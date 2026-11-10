import { describe, expect, it } from "vitest";

import { applyCutoff, scoreRetrieval } from "../../../src/modules/rag/retrieval.js";

const hits = [
  { text: "The gym is on the 3rd floor.", score: 0.82, source: "knowledge.txt" },
  { text: "Pets are allowed on Fridays.", score: 0.41, source: "knowledge.txt" },
];

describe("applyCutoff", () => {
  it("keeps hits at or above the cutoff and reports the rest as dropped", () => {
    const { matched, dropped } = applyCutoff(hits, 0.5);
    expect(matched.map((hit) => hit.score)).toEqual([0.82]);
    expect(dropped.map((hit) => hit.score)).toEqual([0.41]);
  });
});

describe("scoreRetrieval", () => {
  it("counts a hit only when the expected phrase is in the kept chunks", () => {
    const report = scoreRetrieval(
      [
        { question: "Where is the gym?", expect: "3rd floor", hits },
        { question: "What is the capital of Brazil?", hits: [{ text: "Pets on Fridays.", score: 0.39 }] },
      ],
      { k: 3, minScore: 0.5 },
    );

    expect(report.recallAtK).toEqual({ before: 1, after: 1 });
    expect(report.mrr.before).toBe(1);
    expect(report.refusedByCutoff).toBe(1);
  });

  it("lowers recall when the cutoff drops the only chunk that had the answer", () => {
    const report = scoreRetrieval(
      [{ question: "Where is the gym?", expect: "3rd floor", hits: [{ text: "The gym is on the 3rd floor.", score: 0.42 }] }],
      { k: 3, minScore: 0.5 },
    );

    expect(report.recallAtK.before).toBe(1);
    expect(report.recallAtK.after).toBe(0);
    expect(report.mrr.after).toBe(0);
  });

  it("needs every phrase of a two-chunk question, and ranks it where the last phrase appears", () => {
    const twoFiles = [
      { text: "The gym is on the 3rd floor.", score: 0.8 },
      { text: "Pets are allowed on Fridays.", score: 0.7 },
      { text: "The visitor wifi password is lantern-42.", score: 0.6 },
    ];
    const found = scoreRetrieval([{ question: "gym and wifi", expect: ["3rd floor", "lantern-42"], hits: twoFiles }], {
      k: 3,
      minScore: 0.5,
    });
    expect(found.recallAtK.after).toBe(1);
    expect(found.mrr.after).toBeCloseTo(1 / 3);

    const half = scoreRetrieval([{ question: "gym and wifi", expect: ["3rd floor", "lantern-42"], hits: twoFiles }], {
      k: 2,
      minScore: 0.5,
    });
    expect(half.recallAtK.after).toBe(0);
    expect(half.mrr.after).toBe(0);
  });
});