import { redactOutput } from "../../core/redact.js";
import { config } from "../../core/config.js";
import { HttpError } from "../../core/http.js";
import { streamOllamaChat } from "../../core/ollama-stream.js";
import { formatSse } from "../../core/sse.js";

const MAX_MESSAGE = 4000;

export function createStreamingService({
  streamChat = (args) =>
    streamOllamaChat({
      baseUrl: config.ollama.baseUrl,
      model: config.ollama.chatModel,
      ...args,
    }),
  trace,
} = {}) {
  async function chat({ message, signal, write }) {
    const text = typeof message === "string" ? message.trim() : "";
    if (!text) throw new HttpError(400, "Missing 'message'");
    if (text.length > MAX_MESSAGE) {
      throw new HttpError(400, `Message must be at most ${MAX_MESSAGE} characters`);
    }

    const started = Date.now();
    let counts = {};
    let error = null;
    let answer = "";
    try {
      counts =
        (await streamChat({
          messages: [{ role: "user", content: text }],
          signal,
          onToken(token) {
            answer += token;
            write(formatSse("token", { text: token }));
          },
        })) ?? {};
      const redacted = redactOutput(answer);
      if (redacted !== answer) write(formatSse("replace", { text: redacted }));
      write(formatSse("done", { finish: "stop" }));
    } catch (err) {
      if (err?.name !== "AbortError") error = err.message;
      throw err;
    } finally {
      if (typeof trace === "function") {
        trace({
          route: "streaming.chat",
          retrievalMs: null,
          generationMs: Date.now() - started,
          promptTokens: counts.promptTokens ?? null,
          completionTokens: counts.completionTokens ?? null,
          refused: false,
          error,
        });
      }
    }
  }

  return { chat };
}
