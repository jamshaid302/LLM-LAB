import { config } from "../../core/config.js";

import { estimateTokens, parseSampling } from "./sampling.js";

/**
 * One non-streaming chat completion against Ollama, with the sampling settings and the
 * token counts the model actually used. `fetchImpl` is injectable so tests never call
 * a real model.
 */
export function createCompleter({
  fetchImpl = fetch,
  baseUrl = config.ollama.baseUrl,
  model = config.ollama.chatModel,
} = {}) {
  return async function complete(body) {
    const settings = parseSampling(body);
    const messages = [];
    if (settings.system) messages.push({ role: "system", content: settings.system });
    messages.push({ role: "user", content: settings.prompt });

    const options = {
      temperature: settings.temperature,
      top_p: settings.topP,
      num_predict: settings.maxTokens,
    };
    if (settings.seed !== undefined) options.seed = settings.seed;

    let response;
    try {
      response = await fetchImpl(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages, stream: false, options }),
      });
    } catch (cause) {
      throw new Error(`Cannot reach Ollama at ${baseUrl} (${cause.message})`);
    }

    if (!response.ok) {
      throw new Error(`Ollama chat failed: HTTP ${response.status}`);
    }

    const data = await response.json();
    const text = data.message?.content ?? "";

    return {
      text,
      model,
      settings,
      tokens: {
        prompt: data.prompt_eval_count ?? null,
        completion: data.eval_count ?? null,
        // Estimate covers the whole exchange, so it is comparable to prompt + completion.
        estimated: estimateTokens(`${settings.system ?? ""}${settings.prompt}${text}`),
      },
      durationMs: typeof data.eval_duration === "number" ? Math.round(data.eval_duration / 1e6) : null,
    };
  };
}
