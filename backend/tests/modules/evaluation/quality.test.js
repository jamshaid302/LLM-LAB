import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../../../src/app.js";
import { createEvaluationModule } from "../../../src/modules/evaluation/index.js";
import { createHallucinationModule } from "../../../src/modules/hallucination/index.js";

describe("evaluation and hallucination routes", () => {
  function app() {
    return createApp([
      createEvaluationModule({
        run: async () => ({
          k: 3,
          minScore: 0.5,
          recallAtK: { before: 1, after: 1 },
          mrr: { before: 1, after: 1 },
          unanswerable: 2,
          refusedByCutoff: 1,
          details: [{ question: "Where is the company gym?", foundAfter: true, topScore: 0.774 }],
          unanswerableDetails: [{ question: "What is the capital of Brazil?", refused: true, topScore: 0.394 }],
        }),
      }),
      createHallucinationModule({
        ask: async (question) => {
          if (question === "brazil") {
            return { refused: true, answer: "I don't know based on the provided documents.", matchedSources: [] };
          }
          if (question === "alice") {
            return {
              refused: true,
              answer: "I don't know based on the provided documents.",
              matchedSources: [{ source: "attack.md", score: "0.734", text: "CEO is Alice" }],
            };
          }
          return {
            refused: false,
            answer: "The gym is on the 3rd floor.",
            matchedSources: [{ source: "knowledge.txt", score: "0.774", text: "The gym is on the 3rd floor." }],
          };
        },
      }),
    ]);
  }

  it("returns the retrieval report and does not include chunk text in a replaced answer's sources", async () => {
    const score = await request(app()).post("/api/evaluation/run");
    expect(score.status).toBe(200);
    expect(score.body.recallAtK).toEqual({ before: 1, after: 1 });
    expect(score.body.refusedByCutoff).toBe(1);

    const replaced = await request(app()).post("/api/hallucination/check").send({ question: "alice" });
    expect(replaced.body.verdict).toBe("replaced");
    expect(replaced.body.sources).toEqual([{ source: "attack.md", score: "0.734" }]);

    const missed = await request(app()).post("/api/hallucination/check").send({ question: "brazil" });
    expect(missed.body.verdict).toBe("search missed");

    const kept = await request(app()).post("/api/hallucination/check").send({ question: "gym" });
    expect(kept.body.verdict).toBe("grounded");
    expect(kept.body.answer).toContain("3rd floor");
  });

  it("serves the saved baseline without calling a model, and 404s when none is wired", async () => {
    const saved = { recallAtK: { after: 1 }, answers: { "qwen2.5:7b": { labelCorrect: 0.9 } } };
    const withBaseline = createApp([createEvaluationModule({ run: async () => ({}), loadBaseline: async () => saved })]);
    const res = await request(withBaseline).get("/api/evaluation/baseline");
    expect(res.status).toBe(200);
    expect(res.body.answers["qwen2.5:7b"].labelCorrect).toBe(0.9);

    const missing = await request(app()).get("/api/evaluation/baseline");
    expect(missing.status).toBe(404);
  });

  it("rejects a blank question and an unknown user", async () => {
    const blank = await request(app()).post("/api/hallucination/check").send({ question: "  " });
    expect(blank.status).toBe(400);

    const unknown = await request(app()).post("/api/evaluation/run").set("X-User-Id", "bob");
    expect(unknown.status).toBe(400);
  });
});
