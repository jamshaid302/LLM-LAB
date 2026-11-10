import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { FLOORS, baselineHolds, gateFailures } from "../../../src/modules/rag/eval/gate.js";

const baselinePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../src/modules/rag/eval/baseline.json",
);

const passing = {
  recallAtK: { after: 1 },
  mrr: { after: 0.9 },
  refusedByCutoff: 2,
  answers: { [FLOORS.answers.model]: { labelCorrect: 0.95, refused: 7 } },
};

describe("quality gate", () => {
  it("passes on the committed baseline", async () => {
    const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
    expect(gateFailures(baseline)).toEqual([]);
  });

  it("passes a baseline at or above every floor", () => {
    expect(baselineHolds(passing)).toBe(true);
  });

  it("names a retrieval drop", () => {
    expect(gateFailures({ ...passing, recallAtK: { after: 0.5 } })).toEqual(["recall@k after cutoff is 0.5, under 0.95"]);
  });

  it("names an answer-quality drop for the gated model", () => {
    const baseline = { ...passing, answers: { [FLOORS.answers.model]: { labelCorrect: 0.7, refused: 7 } } };
    expect(gateFailures(baseline)).toEqual([`${FLOORS.answers.model} label-correct is 0.7, under 0.9`]);
  });

  it("fails when the gated model has no saved answer run", () => {
    const baseline = { ...passing, answers: { "llama3.2:1b": { labelCorrect: 1, refused: 8 } } };
    expect(gateFailures(baseline)).toEqual([`no answer run saved for ${FLOORS.answers.model}`]);
  });

  it("fails on missing numbers instead of passing them", () => {
    expect(baselineHolds({})).toBe(false);
  });
});
