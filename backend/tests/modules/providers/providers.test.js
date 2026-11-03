import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../../../src/app.js";
import { createProvidersModule } from "../../../src/modules/providers/index.js";
import { quote } from "../../../src/modules/providers/pricing.js";
import { createProviderService } from "../../../src/modules/providers/service.js";

describe("quote", () => {
  it("prices a local model at zero and a hosted rate by the million", () => {
    const tokens = { promptTokens: 1_000_000, completionTokens: 500_000 };
    expect(quote({ ...tokens, inputPerMillionUsd: 0, outputPerMillionUsd: 0 })).toBe(0);
    expect(quote({ ...tokens, inputPerMillionUsd: 0.15, outputPerMillionUsd: 0.6 })).toBe(0.45);
    expect(quote({ promptTokens: null, completionTokens: 3, inputPerMillionUsd: 1, outputPerMillionUsd: 1 })).toBeNull();
  });
});

describe("provider service", () => {
  it("records tokens, latency, a zero local price, and the same tokens at a hosted rate", async () => {
    const completeChat = vi.fn(async () => ({ text: "pong", promptTokens: 20, completionTokens: 4 }));
    let clock = 1000;
    const service = createProviderService({
      completeChat,
      now: () => {
        clock += 25;
        return clock;
      },
    });

    const result = await service.complete({ model: "llama3.2:1b", prompt: "Reply pong" });

    expect(completeChat).toHaveBeenCalledWith({
      model: "llama3.2:1b",
      messages: [{ role: "user", content: "Reply pong" }],
    });
    expect(result).toMatchObject({
      text: "pong",
      model: "llama3.2:1b",
      provider: "ollama",
      promptTokens: 20,
      completionTokens: 4,
      latencyMs: 25,
      costUsd: 0,
      hostedExampleUsd: 0.0000054,
    });
    expect(service.listUsage()).toHaveLength(1);
    expect(service.listModels().models.map((model) => model.id)).toEqual(["llama3.2:1b", "qwen2.5:7b"]);
  });

  it("rejects an unknown model and an empty prompt before calling the model", async () => {
    const completeChat = vi.fn();
    const service = createProviderService({ completeChat });

    await expect(service.complete({ model: "gpt-4", prompt: "hi" })).rejects.toMatchObject({ status: 400 });
    await expect(service.complete({ model: "llama3.2:1b", prompt: "  " })).rejects.toMatchObject({ status: 400 });
    expect(completeChat).not.toHaveBeenCalled();
  });
});

describe("provider routes", () => {
  it("returns the completion and lists it under usage", async () => {
    const service = createProviderService({
      completeChat: async () => ({ text: "pong", promptTokens: 8, completionTokens: 1 }),
    });
    const app = createApp([createProvidersModule({ service })]);

    const res = await request(app).post("/api/providers/complete").send({
      model: "qwen2.5:7b",
      prompt: "Reply pong",
    });

    expect(res.status).toBe(200);
    expect(res.body.text).toBe("pong");
    expect(res.body.costUsd).toBe(0);

    const usage = await request(app).get("/api/providers/usage");
    expect(usage.body.calls).toHaveLength(1);
    expect(usage.body.calls[0].model).toBe("qwen2.5:7b");
  });

  it("returns 400 for an unknown model", async () => {
    const app = createApp([createProvidersModule({ service: createProviderService({ completeChat: vi.fn() }) })]);
    const res = await request(app).post("/api/providers/complete").send({ model: "paid-model", prompt: "hi" });
    expect(res.status).toBe(400);
  });
});
