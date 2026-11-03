/**
 * Local Ollama models are free. The quote function is the same multiplication a
 * hosted bill would use: tokens divided by one million, times the published rate.
 */
export const HOSTED_EXAMPLE = {
  inputPerMillionUsd: 0.15,
  outputPerMillionUsd: 0.6,
  note: "A sample hosted price. Local calls are not billed at this rate.",
};

export const MODELS = [
  {
    id: "llama3.2:1b",
    label: "Llama 3.2 1B",
    provider: "ollama",
    inputPerMillionUsd: 0,
    outputPerMillionUsd: 0,
  },
  {
    id: "qwen2.5:7b",
    label: "Qwen 2.5 7B",
    provider: "ollama",
    inputPerMillionUsd: 0,
    outputPerMillionUsd: 0,
  },
];

export function findModel(models, id) {
  return models.find((model) => model.id === id) ?? null;
}

/** Dollars for one call. Missing token counts produce no price. */
export function quote({ promptTokens, completionTokens, inputPerMillionUsd, outputPerMillionUsd }) {
  if (!Number.isInteger(promptTokens) || !Number.isInteger(completionTokens)) return null;
  const input = (promptTokens / 1_000_000) * inputPerMillionUsd;
  const output = (completionTokens / 1_000_000) * outputPerMillionUsd;
  return Math.round((input + output) * 1e8) / 1e8;
}
