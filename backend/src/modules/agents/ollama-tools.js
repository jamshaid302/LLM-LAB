import { config } from "../../core/config.js";
import { completeOllamaChatResult } from "../../core/ollama-stream.js";

/** One non-streaming Ollama turn that may name a tool. Temperature stays at 0. */
export async function completeWithTools({
  fetchImpl,
  model = config.ollama.agentModel,
  messages,
  tools,
} = {}) {
  const result = await completeOllamaChatResult({
    fetchImpl,
    model,
    messages,
    tools,
    options: { temperature: 0 },
  });
  return {
    content: result.text ?? "",
    toolCalls: result.toolCalls,
  };
}
