import { existsSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { backendRoot, config, readInt } from "../../src/core/config.js";

describe("backendRoot", () => {
  it("resolves to the backend folder that holds this app's package.json", () => {
    expect(existsSync(`${backendRoot}/package.json`)).toBe(true);
  });
});

describe("readInt", () => {
  it("falls back when the variable is unset or empty", () => {
    expect(readInt("DEFINITELY_UNSET_VAR_XYZ", 42)).toBe(42);
  });

  it("throws on a non-numeric value rather than silently using NaN", () => {
    process.env.LAB_TEST_BAD_INT = "not-a-number";
    expect(() => readInt("LAB_TEST_BAD_INT", 1)).toThrow(/must be an integer/);
    delete process.env.LAB_TEST_BAD_INT;
  });

  it("parses a valid value", () => {
    process.env.LAB_TEST_GOOD_INT = "11";
    expect(readInt("LAB_TEST_GOOD_INT", 1)).toBe(11);
    delete process.env.LAB_TEST_GOOD_INT;
  });
});

describe("config", () => {
  it("provides working defaults with no .env present", () => {
    expect(config.ollama.baseUrl).toMatch(/^https?:\/\//);
    expect(config.rag.topK).toBeGreaterThan(0);
    expect(config.rag.chunkOverlap).toBeLessThan(config.rag.chunkSize);
  });
});
