/**
 * CI has no Ollama, so the numbers committed in baseline.json are the gate. Each floor sits
 * a little under the measured value: a real regression fails, one changed word does not.
 * Raise a floor when a change improves the measured value.
 */
export const FLOORS = {
  recall: 0.95,
  mrr: 0.85,
  refusedByCutoff: 2,
  answers: {
    model: "qwen2.5:7b",
    labelCorrect: 0.9,
    unanswerableRefused: 7,
  },
};

/** Every floor the baseline misses. An empty list means the gate passes. */
export function gateFailures(baseline, floors = FLOORS) {
  const failures = [];
  const atLeast = (name, value, floor) => {
    if (typeof value !== "number") failures.push(`${name} is missing`);
    else if (value < floor) failures.push(`${name} is ${value}, under ${floor}`);
  };

  atLeast("recall@k after cutoff", baseline?.recallAtK?.after, floors.recall);
  atLeast("MRR after cutoff", baseline?.mrr?.after, floors.mrr);
  atLeast("unanswerable refused by cutoff", baseline?.refusedByCutoff, floors.refusedByCutoff);

  if (floors.answers) {
    const { model, labelCorrect, unanswerableRefused } = floors.answers;
    const answers = baseline?.answers?.[model];
    if (!answers) {
      failures.push(`no answer run saved for ${model}`);
    } else {
      atLeast(`${model} label-correct`, answers.labelCorrect, labelCorrect);
      atLeast(`${model} unanswerable refused`, answers.refused, unanswerableRefused);
    }
  }
  return failures;
}

export function baselineHolds(baseline, floors = FLOORS) {
  return gateFailures(baseline, floors).length === 0;
}
