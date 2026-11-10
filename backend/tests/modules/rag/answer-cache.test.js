import { describe, expect, it } from "vitest";

import { createAnswerCache } from "../../../src/modules/rag/answer-cache.js";

describe("answer cache", () => {
  it("returns an exact repeat for the same person and drops it when documents change", () => {
    let time = 1_000;
    const cache = createAnswerCache({ now: () => time, ttlMs: 50 });
    cache.set("local", " Where is the gym? ", { answer: "3rd floor" });
    expect(cache.get("local", "where is the gym?").answer).toBe("3rd floor");
    expect(cache.get("guest", "where is the gym?")).toBeNull();

    time = 1_060;
    expect(cache.get("local", "where is the gym?")).toBeNull();

    cache.set("local", "gym", { answer: "3rd floor" });
    cache.clear();
    expect(cache.get("local", "gym")).toBeNull();
  });
});
