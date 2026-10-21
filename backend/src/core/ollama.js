import { Ollama, OllamaEmbeddings } from "@langchain/ollama";

import { config } from "./config.js";

export function createChatModel(overrides = {}) {
  return new Ollama({
    baseUrl: config.ollama.baseUrl,
    model: config.ollama.chatModel,
    temperature: 0,
    ...overrides,
  });
}

export function createEmbeddings(overrides = {}) {
  return new OllamaEmbeddings({
    baseUrl: config.ollama.baseUrl,
    model: config.ollama.embedModel,
    ...overrides,
  });
}

/**
 * Fails loudly at startup instead of letting every request error out one by one.
 * Returns the list of locally available model tags.
 */
export async function assertOllamaReady({ requireModels = [] } = {}) {
  let tags;
  try {
    const res = await fetch(`${config.ollama.baseUrl}/api/tags`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    tags = await res.json();
  } catch (cause) {
    throw new Error(
      `Cannot reach Ollama at ${config.ollama.baseUrl} (${cause.message}). Run "ollama serve".`,
    );
  }

  const available = (tags.models ?? []).map((m) => m.name);
  const missing = requireModels.filter(
    (wanted) => !available.some((name) => name === wanted || name.startsWith(`${wanted}:`)),
  );

  if (missing.length > 0) {
    throw new Error(
      `Missing Ollama model(s): ${missing.join(", ")}. Pull with: ${missing
        .map((m) => `ollama pull ${m}`)
        .join(" && ")}`,
    );
  }

  return available;
}
