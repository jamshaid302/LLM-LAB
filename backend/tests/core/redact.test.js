import { describe, expect, it } from "vitest";

import { redactOutput } from "../../src/core/redact.js";

describe("redactOutput", () => {
  it("hides an email, a phone, a card, and a key", () => {
    const text = redactOutput(
      "Mail ada@example.com, call 415-555-0130, card 4111 1111 1111 1111, key sk-abcdefghij.",
    );
    expect(text).not.toContain("ada@example.com");
    expect(text).not.toContain("415-555-0130");
    expect(text).not.toContain("4111");
    expect(text).not.toContain("sk-abcdefghij");
    expect(text).toContain("[redacted email]");
    expect(text).toContain("[redacted phone]");
    expect(text).toContain("[redacted card]");
    expect(text).toContain("[redacted key]");
  });

  it("keeps a short code and a four-digit room code", () => {
    const text = redactOutput("The visitor wifi password is lantern-42 and the code is 4829.");
    expect(text).toContain("lantern-42");
    expect(text).toContain("4829");
  });
});
