import { describe, expect, it } from "vitest";

import {
  completeOllamaChat,
  completeOllamaChatResult,
  streamOllamaChat,
  takeCompleteLines,
  tokenFromOllamaLine,
} from "../../src/core/ollama-stream.js";
import { consumeSseBuffer, formatSse } from "../../src/core/sse.js";

function ollamaLine(text, done = false) {
  return JSON.stringify({ message: { role: "assistant", content: text }, done });
}

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
