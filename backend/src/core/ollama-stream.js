import { config } from "./config.js";

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
  };
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
} = {}) {
  let response;
  try {
    response = await fetchImpl(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: true }),
      signal,
    });
  } catch (cause) {
    if (cause?.name === "AbortError") throw cause;
    throw new Error(`Cannot reach Ollama at ${baseUrl} (${cause.message})`);
  }

  if (!response.ok) {
    throw new Error(`Ollama chat failed: HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    if (signal?.aborted) {
      throw Object.assign(new Error("The reply was stopped"), { name: "AbortError" });
    }
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const split = takeCompleteLines(buffer);
    buffer = split.rest;

    for (const line of split.lines) {
      const parsed = tokenFromOllamaLine(line);
      if (parsed.token) await onToken(parsed.token);
      if (parsed.done) return;
    }
  }
}
