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

/** `expect` is one phrase or a list. A list needs every phrase, often from different chunks. */
export function expectedPhrases(expect) {
  return (Array.isArray(expect) ? expect : [expect]).map((phrase) => String(phrase).toLowerCase());
}

function hitContains(hit, phrase) {
  return String(hit.text ?? "").toLowerCase().includes(phrase);
}

/** 1-based position where the last missing phrase is first covered, or 0 when one never is. */
function coveringRank(hits, expect) {
  const missing = new Set(expectedPhrases(expect));
  for (let index = 0; index < hits.length; index += 1) {
    for (const phrase of [...missing]) {
      if (hitContains(hits[index], phrase)) missing.delete(phrase);
    }
    if (missing.size === 0) return index + 1;
  }
  return 0;
}

function reciprocalRank(hits, expect) {
  const rank = coveringRank(hits, expect);
  return rank === 0 ? 0 : 1 / rank;
}

/**
 * Recall@k and mean reciprocal rank, before the cutoff and after it.
 * Answerable items must include `expect`: a phrase, or a list of phrases, that the right
 * chunks contain. Unanswerable items have no `expect`; a refusal is every returned hit
 * falling under `minScore`.
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
      foundBefore: coveringRank(beforeHits, item.expect) > 0,
      foundAfter: coveringRank(afterHits, item.expect) > 0,
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
