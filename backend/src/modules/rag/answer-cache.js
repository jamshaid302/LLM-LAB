/** Exact repeat of a question for one person. A document change clears it. */
export function createAnswerCache({ max = 100, ttlMs = 10 * 60 * 1000, now = () => Date.now() } = {}) {
  const entries = new Map();

  function key(userId, question) {
    return `${userId}\n${String(question ?? "").trim().toLowerCase()}`;
  }

  return {
    get(userId, question) {
      const id = key(userId, question);
      const hit = entries.get(id);
      if (!hit) return null;
      if (now() - hit.at > ttlMs) {
        entries.delete(id);
        return null;
      }
      return hit.value;
    },
    set(userId, question, value) {
      const id = key(userId, question);
      if (entries.has(id)) entries.delete(id);
      entries.set(id, { at: now(), value });
      while (entries.size > max) entries.delete(entries.keys().next().value);
    },
    clear() {
      entries.clear();
    },
  };
}
