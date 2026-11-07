const BM25_K1 = 1.2;
const BM25_B = 0.75;
const RRF_CONSTANT = 60;

export function tokenize(text) {
  return String(text ?? "").toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

/** Rank chunks by BM25. A chunk that shares no query term is left out. */
export function rankByBm25(chunks, query) {
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0 || chunks.length === 0) return [];

  const docs = chunks.map((chunk) => tokenize(chunk.text));
  const avgdl = docs.reduce((sum, tokens) => sum + tokens.length, 0) / docs.length || 1;
  const df = new Map();
  for (const tokens of docs) {
    for (const term of new Set(tokens)) df.set(term, (df.get(term) ?? 0) + 1);
  }

  const n = docs.length;
  const scored = chunks.map((chunk, index) => {
    const tokens = docs[index];
    const tf = new Map();
    for (const term of tokens) tf.set(term, (tf.get(term) ?? 0) + 1);
    let keywordScore = 0;
    for (const term of queryTerms) {
      const freq = tf.get(term) ?? 0;
      if (!freq) continue;
      const docsWith = df.get(term) ?? 0;
      const idf = Math.log(1 + (n - docsWith + 0.5) / (docsWith + 0.5));
      const denom = freq + BM25_K1 * (1 - BM25_B + BM25_B * (tokens.length / avgdl));
      keywordScore += idf * ((freq * (BM25_K1 + 1)) / denom);
    }
    return { text: chunk.text, source: chunk.source ?? null, owner: chunk.owner ?? null, keywordScore };
  });

  return scored.filter((hit) => hit.keywordScore > 0).sort((a, b) => b.keywordScore - a.keywordScore);
}

/**
 * Reciprocal rank fusion. Lists are best-first. A numeric `score` on a hit is
 * kept so the cosine cutoff still applies to chunks the vector pass saw.
 */
export function fuseRanks(lists, { limit = 3, constant = RRF_CONSTANT } = {}) {
  const byKey = new Map();
  for (const list of lists) {
    list.forEach((hit, index) => {
      const key = `${hit.source ?? ""}\0${hit.text}`;
      const current = byKey.get(key) ?? {
        text: hit.text,
        source: hit.source ?? null,
        owner: hit.owner ?? null,
        score: null,
        fusion: 0,
      };
      current.fusion += 1 / (constant + index + 1);
      if (typeof hit.score === "number") current.score = hit.score;
      byKey.set(key, current);
    });
  }
  return [...byKey.values()]
    .sort(
      (a, b) =>
        b.fusion - a.fusion || (b.score ?? -1) - (a.score ?? -1) || String(a.text).localeCompare(String(b.text)),
    )
    .slice(0, limit);
}

/** Hybrid replaces vector search only when a metric rises and none fall. */
export function hybridImproves(vector, hybrid) {
  const held =
    hybrid.recallAtK.before >= vector.recallAtK.before &&
    hybrid.recallAtK.after >= vector.recallAtK.after &&
    hybrid.mrr.before >= vector.mrr.before &&
    hybrid.mrr.after >= vector.mrr.after &&
    hybrid.refusedByCutoff >= vector.refusedByCutoff;
  const better =
    hybrid.recallAtK.before > vector.recallAtK.before ||
    hybrid.recallAtK.after > vector.recallAtK.after ||
    hybrid.mrr.before > vector.mrr.before ||
    hybrid.mrr.after > vector.mrr.after ||
    hybrid.refusedByCutoff > vector.refusedByCutoff;
  return held && better;
}
