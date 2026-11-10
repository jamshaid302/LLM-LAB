import { describe, expect, it, vi } from "vitest";

import {
  completeOllamaChat,
  completeOllamaChatResult,
  streamOllamaChat,
  takeCompleteLines,
  tokenFromOllamaLine,
} from "../../src/core/ollama-stream.js";
import { createEmbeddings } from "../../src/core/ollama.js";
import { consumeSseBuffer, formatSse } from "../../src/core/sse.js";

function ollamaLine(text, done = false) {
  return JSON.stringify({ message: { role: "assistant", content: text }, done });
}

describe("embeddings", () => {
  it("retries an embedding once", () => {
    expect(createEmbeddings().caller.maxRetries).toBe(1);
  });
});

describe("takeCompleteLines", () => {
  it("holds back a line that has not finished", () => {
    const split = takeCompleteLines(`${ollamaLine("Hel")}\n${ollamaLine("lo").slice(0, 8)}`);
    expect(split.lines).toEqual([ollamaLine("Hel")]);
    expect(split.rest.startsWith("{")).toBe(true);
  });
});

describe("tokenFromOllamaLine", () => {
  it("reads the token and the done flag", () => {
    expect(tokenFromOllamaLine(ollamaLine("Hi"))).toEqual({
      token: "Hi",
      done: false,
      promptTokens: null,
      completionTokens: null,
    });
    expect(tokenFromOllamaLine(ollamaLine("", true)).done).toBe(true);
  });
});

describe("formatSse and consumeSseBuffer", () => {
  it("round-trips a token event", () => {
    const frame = formatSse("token", { text: "Hi" });
    const { events, rest } = consumeSseBuffer("", frame);
    expect(rest).toBe("");
    expect(events).toEqual([{ event: "token", data: JSON.stringify({ text: "Hi" }) }]);
  });
});

describe("completeOllamaChat", () => {
  it("returns the text, and the result helper keeps the token counts", async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({
        message: { content: "pong" },
        prompt_eval_count: 11,
        eval_count: 2,
      }),
    });

    await expect(completeOllamaChat({ fetchImpl, messages: [] })).resolves.toBe("pong");
    await expect(completeOllamaChatResult({ fetchImpl, messages: [] })).resolves.toMatchObject({
      text: "pong",
      promptTokens: 11,
      completionTokens: 2,
    });
  });

  it("retries a dropped connection once and does not retry a 400", async () => {
    const sleep = async () => {};
    let attempts = 0;
    const recovered = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("connect ECONNRESET");
      return { ok: true, json: async () => ({ message: { content: "pong" } }) };
    };

    await expect(completeOllamaChatResult({ fetchImpl: recovered, messages: [], sleep })).resolves.toMatchObject({
      text: "pong",
    });
    expect(attempts).toBe(2);

    const rejected = vi.fn(async () => ({ ok: false, status: 400, json: async () => ({}) }));
    await expect(completeOllamaChatResult({ fetchImpl: rejected, messages: [], sleep })).rejects.toThrow(/HTTP 400/);
    expect(rejected).toHaveBeenCalledTimes(1);
  });

  it("retries a timeout and keeps a caller abort as a stop", async () => {
    const sleep = async () => {};
    let attempts = 0;
    const recovered = (_url, init) =>
      new Promise((resolve, reject) => {
        attempts += 1;
        if (attempts === 1) {
          init.signal.addEventListener("abort", () => {
            reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          });
          return;
        }
        resolve({ ok: true, json: async () => ({ message: { content: "pong" } }) });
      });

    await expect(
      completeOllamaChatResult({ fetchImpl: recovered, messages: [], timeoutMs: 20, sleep }),
    ).resolves.toMatchObject({ text: "pong" });

    const controller = new AbortController();
    const stopped = vi.fn(
      (_url, init) =>
        new Promise((resolve, reject) => {
          init.signal.addEventListener("abort", () => {
            reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          });
        }),
    );
    const pending = completeOllamaChatResult({
      fetchImpl: stopped,
      messages: [],
      signal: controller.signal,
      timeoutMs: 5_000,
      sleep,
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(stopped).toHaveBeenCalledTimes(1);
  });
});

describe("streamOllamaChat", () => {
  it("emits each content token from the NDJSON stream", async () => {
    const tokens = [];
    await streamOllamaChat({
      fetchImpl: async () => ndjsonResponse([ollamaLine("Hel"), ollamaLine("lo"), ollamaLine("", true)]),
      messages: [{ role: "user", content: "hi" }],
      onToken: (token) => tokens.push(token),
    });
    expect(tokens).toEqual(["Hel", "lo"]);
  });

  it("stops when the caller aborts", async () => {
    const controller = new AbortController();
    const tokens = [];
    const pending = streamOllamaChat({
      fetchImpl: async () => hangingResponse(controller.signal, ollamaLine("partial")),
      messages: [{ role: "user", content: "hi" }],
      signal: controller.signal,
      onToken: (token) => tokens.push(token),
    });

    await viWaitUntil(() => tokens.length === 1);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(tokens).toEqual(["partial"]);
  });

  it("retries a 503 before any token and does not retry after one", async () => {
    const sleep = async () => {};
    let attempts = 0;
    const tokens = [];
    await streamOllamaChat({
      fetchImpl: async () => {
        attempts += 1;
        if (attempts === 1) return { ok: false, status: 503, json: async () => ({}) };
        return ndjsonResponse([ollamaLine("Hel"), ollamaLine("lo"), ollamaLine("", true)]);
      },
      messages: [{ role: "user", content: "hi" }],
      onToken: (token) => tokens.push(token),
      sleep,
    });
    expect(tokens).toEqual(["Hel", "lo"]);
    expect(attempts).toBe(2);

    let pushed = false;
    const broken = new ReadableStream({
      pull(controller) {
        if (!pushed) {
          pushed = true;
          controller.enqueue(new TextEncoder().encode(`${ollamaLine("Hel")}\n`));
          return;
        }
        controller.error(new Error("reset"));
      },
    });
    const once = vi.fn(async () => ({ ok: true, body: broken }));
    await expect(
      streamOllamaChat({
        fetchImpl: once,
        messages: [{ role: "user", content: "hi" }],
        onToken: async () => {},
        sleep,
      }),
    ).rejects.toThrow(/reset/);
    expect(once).toHaveBeenCalledTimes(1);
  });
});

function ndjsonResponse(lines) {
  const stream = new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(new TextEncoder().encode(`${line}\n`));
      controller.close();
    },
  });
  return { ok: true, body: stream };
}

function hangingResponse(signal, firstLine) {
  let sent = false;
  const stream = new ReadableStream({
    async pull(controller) {
      if (!sent) {
        sent = true;
        controller.enqueue(new TextEncoder().encode(`${firstLine}\n`));
        return;
      }
      await new Promise((resolve, reject) => {
        if (signal.aborted) {
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          return;
        }
        signal.addEventListener("abort", () => {
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        });
      });
    },
  });
  return { ok: true, body: stream };
}

async function viWaitUntil(predicate) {
  for (let i = 0; i < 20; i += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("timed out waiting for the first token");
}
