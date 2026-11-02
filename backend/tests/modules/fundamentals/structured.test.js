import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../../../src/app.js";
import { createChatRunner } from "../../../src/modules/fundamentals/complete.js";
import { createFundamentalsModule } from "../../../src/modules/fundamentals/index.js";
import { parseSupportJson } from "../../../src/modules/fundamentals/structured.js";

const VALID = '{"sentiment":"negative","nextStep":"Email the customer today."}';

function ollamaResponse(content) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      message: { role: "assistant", content },
      prompt_eval_count: 20,
      eval_count: 12,
      eval_duration: 100_000_000,
    }),
  };
}

describe("parseSupportJson", () => {
  it("accepts a raw JSON object and normalizes sentiment", () => {
    expect(parseSupportJson('{"sentiment":" Negative ","nextStep":" Call them. "}')).toEqual({
      ok: true,
      data: { sentiment: "negative", nextStep: "Call them." },
    });
  });

  it("accepts JSON wrapped in a markdown fence", () => {
    const parsed = parseSupportJson("```json\n" + VALID + "\n```");
    expect(parsed.ok).toBe(true);
    expect(parsed.data.sentiment).toBe("negative");
  });

  it("rejects prose, a bad sentiment, and a missing next step", () => {
    expect(parseSupportJson("The customer is unhappy.").error).toMatch(/No JSON object/);
    expect(parseSupportJson('{"sentiment":"angry","nextStep":"Call"}').error).toMatch(/sentiment/);
    expect(parseSupportJson('{"sentiment":"negative"}').error).toMatch(/nextStep/);
    expect(parseSupportJson('{"sentiment":"negative","nextStep":"x"} trailing').ok).toBe(true);
    expect(parseSupportJson(VALID + "}").ok).toBe(true);
    expect(parseSupportJson("Note {not json} then " + VALID).ok).toBe(true);
  });
});

describe("extractStructured", () => {
  it("returns the object without a retry when the first reply is valid", async () => {
    const fetchImpl = vi.fn(async () => ollamaResponse(VALID));
    const { extractStructured } = createChatRunner({ fetchImpl, baseUrl: "http://ollama.test" });

    const result = await extractStructured({ task: "The app crashed.", temperature: 0, seed: 1 });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(result.retried).toBe(false);
    expect(result.data).toEqual({ sentiment: "negative", nextStep: "Email the customer today." });
  });

  it("retries once with the validation error and keeps the corrected object", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(ollamaResponse("The customer is unhappy, please call."))
      .mockResolvedValueOnce(ollamaResponse(VALID));
    const { extractStructured } = createChatRunner({ fetchImpl, baseUrl: "http://ollama.test" });

    const result = await extractStructured({ task: "The app crashed." });

    expect(result.ok).toBe(true);
    expect(result.retried).toBe(true);
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0].ok).toBe(false);

    const retry = JSON.parse(fetchImpl.mock.calls[1][1].body);
    expect(retry.messages.at(-1).content).toMatch(/No JSON object found/);
    expect(retry.messages.at(-1).role).toBe("user");
  });

  it("stops after two failures and does not invent data", async () => {
    const fetchImpl = vi.fn(async () => ollamaResponse("still not json"));
    const { extractStructured } = createChatRunner({ fetchImpl, baseUrl: "http://ollama.test" });

    const result = await extractStructured({ task: "The app crashed." });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
    expect(result.data).toBeNull();
    expect(result.error).toMatch(/No JSON object/);
  });
});

describe("POST /api/fundamentals/structured", () => {
  it("returns 422 when both attempts are invalid", async () => {
    const fetchImpl = vi.fn(async () => ollamaResponse("nope"));
    const app = createApp([
      createFundamentalsModule({ runner: createChatRunner({ fetchImpl, baseUrl: "http://ollama.test" }) }),
    ]);

    const res = await request(app).post("/api/fundamentals/structured").send({ task: "The app crashed." });

    expect(res.status).toBe(422);
    expect(res.body.ok).toBe(false);
    expect(res.body.data).toBeNull();
  });

  it("rejects a missing task before calling the model", async () => {
    const fetchImpl = vi.fn();
    const app = createApp([
      createFundamentalsModule({ runner: createChatRunner({ fetchImpl, baseUrl: "http://ollama.test" }) }),
    ]);

    const res = await request(app).post("/api/fundamentals/structured").send({});

    expect(res.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
