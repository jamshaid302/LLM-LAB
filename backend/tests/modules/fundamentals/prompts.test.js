import { describe, expect, it } from "vitest";

import { PATTERN_IDS, buildAllPatterns, buildPattern } from "../../../src/modules/fundamentals/prompts.js";

const TASK = "The app crashed twice and nobody replied.";

describe("buildPattern", () => {
  it("zero-shot is the task alone, with no system prompt and no examples", () => {
    const pattern = buildPattern("zero-shot", TASK);
    expect(pattern.messages).toEqual([{ role: "user", content: TASK }]);
  });

  it("role adds a system prompt that demands a fixed answer shape", () => {
    const pattern = buildPattern("role", TASK);
    expect(pattern.messages[0].role).toBe("system");
    expect(pattern.messages[0].content).toMatch(/Sentiment:/);
    expect(pattern.messages.at(-1)).toEqual({ role: "user", content: TASK });
  });

  it("few-shot puts two worked examples before the task", () => {
    const { messages } = buildPattern("few-shot", TASK);
    const assistantTurns = messages.filter((message) => message.role === "assistant");
    expect(assistantTurns).toHaveLength(2);
    expect(assistantTurns[0].content).toMatch(/Sentiment: positive/);
    expect(messages.at(-1)).toEqual({ role: "user", content: TASK });
    expect(messages.slice(0, -1).some((message) => message.content === TASK)).toBe(false);
  });

  it("chain-of-thought asks for reasoning and a final Answer line", () => {
    const { messages } = buildPattern("chain-of-thought", TASK);
    expect(messages[0].content).toMatch(/step by step/);
    expect(messages[0].content).toMatch(/Answer:/);
    expect(messages.at(-1)).toEqual({ role: "user", content: TASK });
  });

  it("rejects an unknown pattern and an empty task", () => {
    expect(() => buildPattern("magic", TASK)).toThrow(/Unknown pattern/);
    expect(() => buildPattern("zero-shot", "  ")).toThrow(/Missing 'task'/);
  });
});

describe("buildAllPatterns", () => {
  it("returns the four patterns in a stable order with the same task", () => {
    const patterns = buildAllPatterns(TASK);
    expect(patterns.map((pattern) => pattern.id)).toEqual(PATTERN_IDS);
    for (const pattern of patterns) {
      expect(pattern.messages.at(-1).content).toBe(TASK);
    }
  });
});
