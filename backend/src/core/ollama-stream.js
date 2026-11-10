import { config } from "./config.js";
import { failureFromFetch, isRetryableStatus, openAttemptSignal, retryOllama } from "./ollama-retry.js";

/** Keep leftover characters that are not yet a full NDJSON line. */
export function takeCompleteLines(buffer) {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  return {
    lines: lines.map((line) => line.trim()).filter(Boolean),
    rest,
  };
}

/** One line from Ollama's streaming /api/chat response. */
export function tokenFromOllamaLine(line) {
  const json = JSON.parse(line);
  return {
    token: json.message?.content ?? "",
    done: Boolean(json.done),
    promptTokens: countOrNull(json.prompt_eval_count),
    completionTokens: countOrNull(json.eval_count),
  };
}

/** One non-streaming reply, including the token counts Ollama reports for that call. */
export async function completeOllamaChatResult({
  fetchImpl = fetch,
  baseUrl = config.ollama.baseUrl,
  model = config.ollama.chatModel,
  messages,
  tools,
  signal,
  options,
  timeoutMs = config.ollama.timeoutMs,
  retries = 1,
  sleep,
} = {}) {
  return retryOllama(
    () =>
      chatOnce({
        fetchImpl,
        baseUrl,
        model,
        messages,
        tools,
        signal,
        options,
        timeoutMs,
      }),
    { retries, sleep },
  );
}

async function chatOnce({ fetchImpl, baseUrl, model, messages, tools, signal, options, timeoutMs }) {
  const attempt = openAttemptSignal(signal, timeoutMs);
  try {
    let response;
    try {
      response = await fetchImpl(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          ...(tools?.length ? { tools } : {}),
          ...(options ? { options } : {}),
        }),
        signal: attempt.signal,
      });
    } catch (cause) {
      throw failureFromFetch(cause, { caller: signal, attempt, timeoutMs, baseUrl });
    }

    if (!response.ok) {
      throw Object.assign(new Error(`Ollama chat failed: HTTP ${response.status}`), {
        retryable: isRetryableStatus(response.status),
      });
    }

    const data = await response.json();
    const toolCalls = data.message?.tool_calls;
    return {
      text: data.message?.content ?? "",
      toolCalls: Array.isArray(toolCalls) ? toolCalls : [],
      promptTokens: countOrNull(data.prompt_eval_count),
      completionTokens: countOrNull(data.eval_count),
      durationMs: typeof data.eval_duration === "number" ? Math.round(data.eval_duration / 1e6) : null,
    };
  } finally {
    attempt.clear();
  }
}

/** One non-streaming reply. Used for the conversation summary, which is itself a model call. */
export async function completeOllamaChat(args) {
  const result = await completeOllamaChatResult(args);
  return result.text;
}

function countOrNull(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

/**
 * Read Ollama's token stream and call onToken for each piece of text.
 * `fetchImpl` is injectable so tests never open a network connection.
 */
export async function streamOllamaChat({
  fetchImpl = fetch,
  baseUrl = config.ollama.baseUrl,
  model = config.ollama.chatModel,
  messages,
  signal,
  onToken,
  timeoutMs = config.ollama.timeoutMs,
  retries = 1,
  sleep,
} = {}) {
  return retryOllama(
    () => streamOnce({ fetchImpl, baseUrl, model, messages, signal, onToken, timeoutMs }),
    { retries, sleep },
  );
}

async function streamOnce({ fetchImpl, baseUrl, model, messages, signal, onToken, timeoutMs }) {
  const attempt = openAttemptSignal(signal, timeoutMs);
  let sent = false;
  try {
    let response;
    try {
      response = await fetchImpl(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages, stream: true }),
        signal: attempt.signal,
      });
    } catch (cause) {
      throw failureFromFetch(cause, { caller: signal, attempt, timeoutMs, baseUrl });
    }

    if (!response.ok) {
      throw Object.assign(new Error(`Ollama chat failed: HTTP ${response.status}`), {
        retryable: isRetryableStatus(response.status),
      });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let promptTokens = null;
    let completionTokens = null;

    while (true) {
      if (signal?.aborted) {
        throw Object.assign(new Error("The reply was stopped"), { name: "AbortError" });
      }
      if (attempt.timedOut()) {
        throw Object.assign(new Error(`Ollama timed out after ${timeoutMs}ms`), { retryable: !sent });
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const split = takeCompleteLines(buffer);
      buffer = split.rest;

      for (const line of split.lines) {
        const parsed = tokenFromOllamaLine(line);
        if (parsed.token) {
          sent = true;
          await onToken(parsed.token);
        }
        if (parsed.promptTokens != null) promptTokens = parsed.promptTokens;
        if (parsed.completionTokens != null) completionTokens = parsed.completionTokens;
        if (parsed.done) return { promptTokens, completionTokens };
      }
    }

    return { promptTokens, completionTokens };
  } catch (cause) {
    if (signal?.aborted) {
      if (cause?.name === "AbortError") throw cause;
      throw Object.assign(new Error("The reply was stopped"), { name: "AbortError" });
    }
    if (cause?.retryable !== undefined) throw cause;
    if (sent) {
      if (attempt.timedOut() || cause?.name === "AbortError" || cause?.name === "TimeoutError") {
        throw Object.assign(new Error(`Ollama timed out after ${timeoutMs}ms`), { retryable: false });
      }
      cause.retryable = false;
      throw cause;
    }
    throw failureFromFetch(cause, { caller: signal, attempt, timeoutMs, baseUrl });
  } finally {
    attempt.clear();
  }
}
