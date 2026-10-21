import { describe, expect, it } from "vitest";

import { estimateTokens, parseSampling } from "../../../src/modules/fundamentals/sampling.js";

describe("estimateTokens", () => {
  it("uses the 4-characters-per-token rule of thumb", () => {
    expect(estimateTokens("1234")).toBe(1);
    expect(estimateTokens("12345")).toBe(2);
  });

  it("rounds up a short string instead of reporting zero tokens", () => {
    expect(estimateTokens("hi")).toBe(1);
  });
});

describe("parseSampling", () => {
  it("defaults to a deterministic, bounded completion", () => {
    expect(parseSampling({ prompt: "hello" })).toEqual({
      prompt: "hello",
      temperature: 0,
      topP: 0.9,
      maxTokens: 128,
    });
  });

  it("keeps a system prompt and an explicit seed when given", () => {
    const settings = parseSampling({ prompt: "hello", system: "be brief", seed: 7, temperature: 0.8 });
    expect(settings.system).toBe("be brief");
    expect(settings.seed).toBe(7);
    expect(settings.temperature).toBe(0.8);
  });

  it("rejects a missing prompt", () => {
    expect(() => parseSampling({})).toThrow(/Missing 'prompt'/);
  });

  it("rejects a temperature outside 0 to 2", () => {
    expect(() => parseSampling({ prompt: "hi", temperature: 3 })).toThrow(/temperature/);
  });

  it("rejects a fractional maxTokens", () => {
    expect(() => parseSampling({ prompt: "hi", maxTokens: 1.5 })).toThrow(/whole number/);
  });

  it("rejects a prompt longer than 4000 characters", () => {
    expect(() => parseSampling({ prompt: "a".repeat(4001) })).toThrow(/4000/);
  });
});
