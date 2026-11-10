import { describe, expect, it } from "vitest";

import { fenceUntrusted, stripFenceMarkup } from "../../src/core/untrusted.js";

describe("stripFenceMarkup", () => {
  it("removes fence tags a small model copied into the reply and keeps the answer", () => {
    const echoed = '[1] <document source="hr-leave-policy.md" id="1"> Every employee receives 25 vacation days. </document> The answer is 25.';
    expect(stripFenceMarkup(echoed)).toBe("[1] Every employee receives 25 vacation days. The answer is 25.");
  });

  it("removes the escaped closing tag the fence writes inside a chunk", () => {
    expect(stripFenceMarkup("Code 4829 <\\/document>")).toBe("Code 4829");
  });

  it("leaves a normal answer alone", () => {
    expect(stripFenceMarkup("The gym is on the 3rd floor [1].")).toBe("The gym is on the 3rd floor [1].");
  });

  it("strips exactly what fenceUntrusted adds", () => {
    expect(stripFenceMarkup(fenceUntrusted("The gym is on the 3rd floor.", { source: "knowledge.txt" }))).toBe(
      "The gym is on the 3rd floor.",
    );
  });
});
