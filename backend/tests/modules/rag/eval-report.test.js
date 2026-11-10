import { describe, expect, it } from "vitest";

import { NO_ANSWER } from "../../../src/modules/rag/prompt.js";
import {
  answerDrops,
  answerableRow,
  retrievalDrops,
  retrievalSummary,
  summarizeAnswers,
  unanswerableRow,
} from "../../../src/modules/rag/eval/report.js";
import { scoreRetrieval } from "../../../src/modules/rag/retrieval.js";

const chunks = [
  { text: "The gym is on the 3rd floor.", source: "knowledge.txt" },
  { text: "The visitor wifi password is lantern-42.", source: "office.txt" },
];

describe("retrievalSummary", () => {
  it("lists files, counts two-chunk questions, and names the misses", () => {
    const suite = {
      answerable: [
        { question: "gym", expect: "3rd floor" },
        { question: "gym and wifi", expect: ["3rd floor", "lantern-42"] },
      ],
      unanswerable: [{ question: "Brazil" }],
    };
    const report = scoreRetrieval(
      [
        { ...suite.answerable[0], hits: [{ ...chunks[0], score: 0.8 }] },
        { ...suite.answerable[1], hits: [{ ...chunks[0], score: 0.7 }] },
        { ...suite.unanswerable[0], hits: [{ ...chunks[1], score: 0.55 }] },
      ],
      { k: 3, minScore: 0.5 },
    );
    const summary = retrievalSummary(report, { chunks, suite, embedModel: "fake", measured: "2026-10-29" });

    expect(summary.files).toEqual(["knowledge.txt", "office.txt"]);
    expect(summary.questions).toEqual({ answerable: 2, multiChunk: 1, multiChunkSpanning: 1, unanswerable: 1 });
    expect(summary.recallAtK.after).toBe(0.5);
    expect(summary.missed).toEqual([{ question: "gym and wifi", topScore: 0.7, foundBeforeCutoff: false }]);
    expect(summary.notRefused).toEqual([{ question: "Brazil", topScore: 0.55 }]);
  });
});

describe("retrievalDrops", () => {
  it("reports each metric that fell and nothing when they held", () => {
    const before = { recallAtK: { after: 1 }, mrr: { after: 0.9 }, refusedByCutoff: 2 };
    expect(retrievalDrops(before, before)).toEqual([]);
    expect(retrievalDrops({ recallAtK: { after: 0.9 }, mrr: { after: 0.9 }, refusedByCutoff: 1 }, before)).toEqual([
      "recall@k after cutoff fell from 1 to 0.9",
      "unanswerable refused by cutoff fell from 2 to 1",
    ]);
  });
});

describe("answer rows and summary", () => {
  it("grades answerable rows by label and judge, and unanswerable rows by refusal", () => {
    const good = answerableRow({
      question: "gym",
      facts: ["3rd floor"],
      result: { answer: "It is on the 3rd floor [1]." },
      judgeReply: "Yes",
      labelSays: true,
      ms: 100,
    });
    const refused = answerableRow({
      question: "code",
      facts: ["4829"],
      result: { answer: NO_ANSWER },
      judgeReply: "no",
      labelSays: false,
      ms: 300,
    });
    const byCutoff = unanswerableRow({ question: "Brazil", result: { answer: NO_ANSWER, matchedSources: [] }, ms: 10 });
    const byModel = unanswerableRow({
      question: "CEO",
      result: { answer: NO_ANSWER, matchedSources: [{ source: "knowledge.txt" }] },
      ms: 50,
    });
    const answered = unanswerableRow({
      question: "contractors",
      result: { answer: "Contractors get 25 days.", matchedSources: [{ source: "hr-leave-policy.md" }] },
      ms: 40,
    });

    expect(good).toMatchObject({ label: true, judge: true, agree: true, refused: false });
    expect(refused).toMatchObject({ label: false, judge: false, agree: true, refused: true });
    expect(byCutoff.by).toBe("cutoff");
    expect(byModel.by).toBe("model or grounding check");
    expect(answered).toMatchObject({ refused: false, by: null });

    const summary = summarizeAnswers([good, refused], [byCutoff, byModel, answered]);
    expect(summary).toMatchObject({
      answerable: 2,
      labelCorrect: 0.5,
      judgeCorrect: 0.5,
      judgeAgreement: 1,
      falseRefusals: 1,
      unanswerable: 3,
      refused: 2,
      refusedByCutoff: 1,
      refusedAfterRetrieval: 1,
      answeredAnyway: ["contractors"],
      averageMs: 100,
    });
  });
});

describe("answerDrops", () => {
  const baseline = { labelCorrect: 0.9, refused: 6 };

  it("allows a small wobble and catches a real drop", () => {
    expect(answerDrops({ labelCorrect: 0.87, refused: 6 }, baseline)).toEqual([]);
    expect(answerDrops({ labelCorrect: 0.8, refused: 5 }, baseline)).toEqual([
      "label-correct fell from 0.9 to 0.8",
      "unanswerable refused fell from 6 to 5",
    ]);
  });

  it("has nothing to compare for a model with no saved run", () => {
    expect(answerDrops({ labelCorrect: 0, refused: 0 }, undefined)).toEqual([]);
  });
});
