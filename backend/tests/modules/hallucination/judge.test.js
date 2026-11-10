import { describe, expect, it } from "vitest";

import { createHallucinationService } from "../../../src/modules/hallucination/service.js";

describe("hallucination judge", () => {
  function service(complete) {
    return createHallucinationService({
      ask: async () => ({
        answer: "The gym is on the 3rd floor.",
        refused: false,
        matchedSources: [{ source: "knowledge.txt", score: 0.8 }],
      }),
      complete,
      labelFor: async (question) => (question === "Where is the company gym?" ? "3rd floor" : null),
    });
  }

  it("agrees when the model and the human label both see the fact", async () => {
    const result = await service(async () => "yes").judge("Where is the company gym?");
    expect(result.agree).toBe(true);
    expect(result.modelSays).toBe(true);
    expect(result.labelSays).toBe(true);
    expect(result.expect).toBe("3rd floor");
  });

  it("disagrees when the model says the fact is missing", async () => {
    const result = await service(async () => "no").judge("Where is the company gym?");
    expect(result.modelSays).toBe(false);
    expect(result.labelSays).toBe(true);
    expect(result.agree).toBe(false);
  });

  it("needs every fact of a two-fact label in the answer", async () => {
    const prompts = [];
    const twoFacts = createHallucinationService({
      ask: async () => ({ answer: "The gym is on the 3rd floor.", refused: false, matchedSources: [] }),
      complete: async (prompt) => {
        prompts.push(prompt);
        return "no";
      },
      labelFor: async () => ["3rd floor", "lantern-42"],
    });
    const result = await twoFacts.judge("Where is the gym and what is the wifi password?");
    expect(result.expect).toBe("3rd floor, lantern-42");
    expect(result.labelSays).toBe(false);
    expect(result.agree).toBe(true);
    expect(prompts[0]).toContain("Facts: 3rd floor; lantern-42");
    expect(prompts[0]).toContain("every one of those facts");
  });

  it("rejects a question with no human label", async () => {
    await expect(service(async () => "yes").judge("What is the capital of Brazil?")).rejects.toThrow(/human label/);
  });
});
