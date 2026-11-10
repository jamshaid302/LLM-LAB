export function createEvaluationService({ run }) {
  async function score(userId) {
    return run(userId);
  }

  return { score };
}
