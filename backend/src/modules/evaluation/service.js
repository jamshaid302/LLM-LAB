import { HttpError } from "../../core/http.js";

export function createEvaluationService({ run, loadBaseline }) {
  async function score(userId) {
    return run(userId);
  }

  /** The numbers the live eval scripts saved. Reading them calls no model. */
  async function baseline() {
    if (typeof loadBaseline !== "function") throw new HttpError(404, "No saved baseline");
    return loadBaseline();
  }

  return { score, baseline };
}
