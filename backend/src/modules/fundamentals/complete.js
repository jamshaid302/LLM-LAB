import { config } from "../../core/config.js";
import { HttpError } from "../../core/http.js";

import { buildAllPatterns } from "./prompts.js";
import { estimateTokens, parseSampling } from "./sampling.js";
import { JSON_SYSTEM, correctionMessage, parseSupportJson } from "./structured.js";

/**
 * Chat completions against Ollama. `fetchImpl` is injectable so tests never call a
 * real model. `complete` is one prompt. `comparePatterns` runs the same task through
 * every prompting pattern with the same sampling settings.
 */
export function createChatRunner({
  fetchImpl = fetch,
  baseUrl = config.ollama.baseUrl,
  model = config.ollama.chatModel,
} = {}) {
  async function run(settings, messages) {
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
    const transcript = messages.map((message) => message.content).join("") + text;

    return {
      text,
      model,
      settings,
      tokens: {
        prompt: data.prompt_eval_count ?? null,
        completion: data.eval_count ?? null,
        estimated: estimateTokens(transcript),
      },
      durationMs: typeof data.eval_duration === "number" ? Math.round(data.eval_duration / 1e6) : null,
    };
  }

  async function complete(body) {
    const settings = parseSampling(body);
    const messages = [];
    if (settings.system) messages.push({ role: "system", content: settings.system });
    messages.push({ role: "user", content: settings.prompt });
    return run(settings, messages);
  }

  async function comparePatterns(body) {
    const task = typeof body?.task === "string" ? body.task.trim() : "";
    if (!task) throw new HttpError(400, "Missing 'task'");

    // Reuse sampling validation. The task stands in for the prompt so temperature,
    // top-p, seed, and max tokens are checked once and then shared by every pattern.
    const settings = parseSampling({ ...body, prompt: task });
    const runs = [];
    for (const pattern of buildAllPatterns(task)) {
      const result = await run(settings, pattern.messages);
      runs.push({
        pattern: pattern.id,
        label: pattern.label,
        messages: pattern.messages,
        text: result.text,
        tokens: result.tokens,
        durationMs: result.durationMs,
      });
    }

    return {
      task,
      model,
      settings: sharedSettings(settings),
      runs,
    };
  }

  async function extractStructured(body) {
    const task = typeof body?.task === "string" ? body.task.trim() : "";
    if (!task) throw new HttpError(400, "Missing 'task'");

    const settings = parseSampling({ ...body, prompt: task });
    const messages = [
      { role: "system", content: JSON_SYSTEM },
      { role: "user", content: task },
    ];

    const first = await run(settings, messages);
    const firstParsed = parseSupportJson(first.text);
    const attempts = [attemptFrom(first, firstParsed)];

    if (firstParsed.ok) {
      return structuredResult({ settings, retried: false, data: firstParsed.data, attempts });
    }

    const retryMessages = [
      ...messages,
      { role: "assistant", content: first.text },
      { role: "user", content: correctionMessage(firstParsed.error) },
    ];
    const second = await run(settings, retryMessages);
    const secondParsed = parseSupportJson(second.text);
    attempts.push(attemptFrom(second, secondParsed));

    return structuredResult({
      settings,
      retried: true,
      data: secondParsed.ok ? secondParsed.data : null,
      attempts,
    });
  }

  function structuredResult({ settings, retried, data, attempts }) {
    return {
      ok: data !== null,
      retried,
      data,
      error: data ? null : attempts.at(-1).error,
      model,
      settings: sharedSettings(settings),
      attempts,
    };
  }

  return { complete, comparePatterns, extractStructured };
}

function sharedSettings(settings) {
  return {
    temperature: settings.temperature,
    topP: settings.topP,
    maxTokens: settings.maxTokens,
    ...(settings.seed !== undefined ? { seed: settings.seed } : {}),
  };
}

function attemptFrom(result, parsed) {
  return {
    text: result.text,
    ok: parsed.ok,
    error: parsed.ok ? null : parsed.error,
    tokens: result.tokens,
    durationMs: result.durationMs,
  };
}

/** @deprecated Use createChatRunner().complete. Kept so older call sites stay valid. */
export function createCompleter(options) {
  return createChatRunner(options).complete;
}
