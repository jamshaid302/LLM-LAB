/**
 * Higher scores are closer. Hits under `minScore` are not given to the model.
 * Search still returns them so the UI can show why a question was refused.
 */
export function applyCutoff(hits, minScore) {
  const matched = [];
  const dropped = [];
  for (const hit of hits) {
    (hit.score >= minScore ? matched : dropped).push(hit);
  }
  return { matched, dropped };
}

function containsExpect(hit, expect) {
  return hit.text.toLowerCase().includes(String(expect).toLowerCase());
}

function reciprocalRank(hits, expect) {
  const index = hits.findIndex((hit) => containsExpect(hit, expect));
  return index === -1 ? 0 : 1 / (index + 1);
}

/**
 * Recall@k and mean reciprocal rank, before the cutoff and after it.
 * Answerable items must include `expect` (a phrase that should appear in the right chunk).
 * Unanswerable items have no `expect`; a refusal is every returned hit falling under `minScore`.
 */
export function scoreRetrieval(items, { k, minScore }) {
  const answerable = items.filter((item) => item.expect);
  const unanswerable = items.filter((item) => !item.expect);

  const details = answerable.map((item) => {
    const beforeHits = item.hits.slice(0, k);
    const afterHits = beforeHits.filter((hit) => hit.score >= minScore);
    return {
      question: item.question,
      expect: item.expect,
      foundBefore: beforeHits.some((hit) => containsExpect(hit, item.expect)),
      foundAfter: afterHits.some((hit) => containsExpect(hit, item.expect)),
      rankBefore: reciprocalRank(beforeHits, item.expect),
      rankAfter: reciprocalRank(afterHits, item.expect),
      topScore: beforeHits[0]?.score ?? null,
    };
  });

  const refused = unanswerable.filter((item) =>
    item.hits.slice(0, k).every((hit) => hit.score < minScore),
  );

  const mean = (values) => (values.length === 0 ? 0 : values.reduce((sum, n) => sum + n, 0) / values.length);

  return {
    k,
    minScore,
    answerable: answerable.length,
    recallAtK: {
      before: mean(details.map((row) => (row.foundBefore ? 1 : 0))),
      after: mean(details.map((row) => (row.foundAfter ? 1 : 0))),
    },
    mrr: {
      before: mean(details.map((row) => row.rankBefore)),
      after: mean(details.map((row) => row.rankAfter)),
    },
    unanswerable: unanswerable.length,
    refusedByCutoff: refused.length,
    details,
    unanswerableDetails: unanswerable.map((item) => ({
      question: item.question,
      refused: item.hits.slice(0, k).every((hit) => hit.score < minScore),
      topScore: item.hits[0]?.score ?? null,
    })),
  };
}
