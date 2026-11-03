import { config } from "../../core/config.js";
import { HttpError } from "../../core/http.js";
import { completeOllamaChatResult } from "../../core/ollama-stream.js";

import { HOSTED_EXAMPLE, MODELS, findModel, quote } from "./pricing.js";
import { createUsageLog } from "./usage-log.js";

const MAX_PROMPT = 4000;

export function createProviderService({
  completeChat = (args) =>
    completeOllamaChatResult({
      baseUrl: config.ollama.baseUrl,
      ...args,
    }),
  log = createUsageLog(),
  models = MODELS,
  now = () => Date.now(),
} = {}) {
  function listModels() {
    return {
      models: models.map((model) => ({
        id: model.id,
        label: model.label,
        provider: model.provider,
        inputPerMillionUsd: model.inputPerMillionUsd,
        outputPerMillionUsd: model.outputPerMillionUsd,
        default: model.id === config.ollama.chatModel,
      })),
      hostedExample: HOSTED_EXAMPLE,
    };
  }

  async function complete({ model, prompt }) {
    const text = typeof prompt === "string" ? prompt.trim() : "";
    if (!text) throw new HttpError(400, "Missing 'prompt'");
    if (text.length > MAX_PROMPT) {
      throw new HttpError(400, `Prompt must be at most ${MAX_PROMPT} characters`);
    }

    const chosen = findModel(models, typeof model === "string" ? model : "");
    if (!chosen) throw new HttpError(400, "Unknown model");

    const started = now();
    const result = await completeChat({
      model: chosen.id,
      messages: [{ role: "user", content: text }],
    });
    const latencyMs = Math.max(0, now() - started);
    const promptTokens = result.promptTokens ?? null;
    const completionTokens = result.completionTokens ?? null;
    const rates = {
      inputPerMillionUsd: chosen.inputPerMillionUsd,
      outputPerMillionUsd: chosen.outputPerMillionUsd,
    };

    const record = log.add({
      model: chosen.id,
      provider: chosen.provider,
      promptTokens,
      completionTokens,
      latencyMs,
      costUsd: quote({ promptTokens, completionTokens, ...rates }),
      hostedExampleUsd: quote({
        promptTokens,
        completionTokens,
        inputPerMillionUsd: HOSTED_EXAMPLE.inputPerMillionUsd,
        outputPerMillionUsd: HOSTED_EXAMPLE.outputPerMillionUsd,
      }),
      promptPreview: text.slice(0, 80),
    });

    return { text: result.text ?? "", ...record };
  }

  return {
    listModels,
    complete,
    listUsage: () => log.list(),
  };
}
