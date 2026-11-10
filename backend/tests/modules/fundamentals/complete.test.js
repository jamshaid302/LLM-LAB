import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../../../src/app.js";
import { createChatRunner } from "../../../src/modules/fundamentals/complete.js";
import { createFundamentalsModule } from "../../../src/modules/fundamentals/index.js";

function ollamaResponse(content, counts = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      message: { role: "assistant", content },
      prompt_eval_count: counts.prompt ?? 5,
      eval_count: counts.completion ?? 3,
      eval_duration: 250_000_000,
    }),
  };
}

describe("createChatRunner", () => {
  it("sends sampling options and reports real token counts beside the estimate", async () => {
    const fetchImpl = vi.fn(async () => ollamaResponse("Bluebird Coffee."));
    const { complete } = createChatRunner({ fetchImpl, baseUrl: "http://ollama.test", model: "test-model" });

    const result = await complete({ prompt: "tagline", temperature: 0, seed: 1, maxTokens: 32 });

    const [, requestInit] = fetchImpl.mock.calls[0];
    const sent = JSON.parse(requestInit.body);
    expect(sent.model).toBe("test-model");
    expect(sent.stream).toBe(false);
    expect(sent.options).toEqual({ temperature: 0, top_p: 0.9, num_predict: 32, seed: 1 });

    expect(result.text).toBe("Bluebird Coffee.");
    expect(result.tokens.prompt).toBe(5);
    expect(result.tokens.completion).toBe(3);
    expect(result.tokens.estimated).toBeGreaterThan(0);
    expect(result.durationMs).toBe(250);
  });

  it("turns an unreachable Ollama into a clear error after one retry", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED");
    });
    const { complete } = createChatRunner({ fetchImpl, baseUrl: "http://ollama.test", sleep: async () => {} });

    await expect(complete({ prompt: "hi" })).rejects.toThrow(/Cannot reach Ollama/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("POST /api/fundamentals/complete", () => {
  it("returns the completion from the injected completer", async () => {
    const complete = vi.fn(async () => ({ text: "ok" }));
    const app = createApp([createFundamentalsModule({ complete })]);

    const res = await request(app).post("/api/fundamentals/complete").send({ prompt: "hi" });

    expect(res.status).toBe(200);
    expect(res.body.text).toBe("ok");
    expect(complete).toHaveBeenCalledWith({
      prompt: "hi",
      temperature: 0,
      topP: 0.9,
      maxTokens: 128,
    });
  });

  it("rejects a bad sampling setting before calling the model", async () => {
    const complete = vi.fn();
    const app = createApp([createFundamentalsModule({ complete })]);

    const res = await request(app).post("/api/fundamentals/complete").send({ prompt: "hi", temperature: 9 });

    expect(res.status).toBe(400);
    expect(complete).not.toHaveBeenCalled();
  });
});

describe("pattern comparison", () => {
  it("runs every pattern with the same sampling settings and the task last", async () => {
    const fetchImpl = vi.fn(async () => ollamaResponse("Sentiment: negative"));
    const { comparePatterns } = createChatRunner({
      fetchImpl,
      baseUrl: "http://ollama.test",
      model: "test-model",
    });

    const result = await comparePatterns({
      task: "The app crashed.",
      temperature: 0,
      seed: 1,
      maxTokens: 40,
    });

    expect(result.runs.map((run) => run.pattern)).toEqual([
      "zero-shot",
      "role",
      "few-shot",
      "chain-of-thought",
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(4);

    const bodies = fetchImpl.mock.calls.map(([, init]) => JSON.parse(init.body));
    for (const body of bodies) {
      expect(body.options).toEqual({ temperature: 0, top_p: 0.9, num_predict: 40, seed: 1 });
      expect(body.messages.at(-1)).toEqual({ role: "user", content: "The app crashed." });
    }
    expect(bodies[2].messages.filter((message) => message.role === "assistant")).toHaveLength(2);
  });

  it("rejects a missing task before calling the model", async () => {
    const fetchImpl = vi.fn();
    const app = createApp([
      createFundamentalsModule({ runner: createChatRunner({ fetchImpl, baseUrl: "http://ollama.test" }) }),
    ]);

    const res = await request(app).post("/api/fundamentals/patterns").send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Missing 'task'/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
