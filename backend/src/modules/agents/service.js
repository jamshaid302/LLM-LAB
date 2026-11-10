import { config } from "../../core/config.js";
import { HttpError } from "../../core/http.js";

import { MAX_MS, MAX_STEPS, runAgent } from "./loop.js";
import { completeWithTools } from "./ollama-tools.js";

const MAX_TASK = 4000;

export function createAgentsService({
  search,
  complete,
  maxSteps = MAX_STEPS,
  maxMs = MAX_MS,
  now,
  model = config.ollama.agentModel,
} = {}) {
  if (typeof search !== "function") throw new Error("Agents need a search function");
  const chat = complete ?? ((input) => completeWithTools({ ...input, model }));

  async function run(task, userId) {
    const text = typeof task === "string" ? task.trim() : "";
    if (!text) throw new HttpError(400, "Missing 'task'");
    if (text.length > MAX_TASK) {
      throw new HttpError(400, `Task must be at most ${MAX_TASK} characters`);
    }

    const result = await runAgent({
      task: text,
      userId,
      complete: chat,
      search,
      maxSteps,
      maxMs,
      now,
    });
    return { model, task: text, ...result };
  }

  return {
    run,
    get maxSteps() {
      return maxSteps;
    },
    get model() {
      return model;
    },
  };
}
