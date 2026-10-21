import { describe, expect, it } from "vitest";

import { NO_ANSWER, buildRagPrompt, formatContext } from "../../../src/modules/rag/prompt.js";

const docs = [{ pageContent: "The gym is on the 3rd floor." }, { pageContent: "Pets on Fridays." }];

describe("formatContext", () => {
  it("numbers chunks from 1 so the model has stable citation labels", () => {
    expect(formatContext(docs)).toBe("[1] The gym is on the 3rd floor.\n\n[2] Pets on Fridays.");
  });

  it("returns an empty string when retrieval found nothing", () => {
    expect(formatContext([])).toBe("");
  });
});

describe("buildRagPrompt", () => {
  it("includes the question and every retrieved chunk", () => {
    const prompt = buildRagPrompt({ question: "Where is the gym?", docs });

    expect(prompt).toContain("Question: Where is the gym?");
    expect(prompt).toContain("[1] The gym is on the 3rd floor.");
    expect(prompt).toContain("[2] Pets on Fridays.");
  });

  it("instructs the model to refuse rather than guess", () => {
    expect(buildRagPrompt({ question: "q", docs })).toContain(NO_ANSWER);
  });

  it("ends with the answer cue so the model continues rather than restates", () => {
    expect(buildRagPrompt({ question: "q", docs }).endsWith("Answer:")).toBe(true);
  });
});
