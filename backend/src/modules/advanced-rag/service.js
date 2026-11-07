import { fuseRanks, hybridImproves, rankByBm25 } from "./hybrid.js";

/**
 * Compares vector search with keyword-plus-vector fusion on one question set.
 * It does not change the retriever RAG and Semantic Search call.
 */
export function createAdvancedRagService({
  searchWide,
  listChunks,
  loadSuite,
  score,
  k = 3,
  candidateK = 20,
  minScore,
}) {
  async function compare(userId) {
    const suite = await loadSuite();
    const chunks = await listChunks(userId);
    const vectorItems = [];
    const hybridItems = [];

    for (const item of [...suite.answerable, ...suite.unanswerable]) {
      const wide = await searchWide(item.question, userId);
      const keyword = rankByBm25(chunks, item.question).slice(0, candidateK);
      vectorItems.push({ ...item, hits: wide.slice(0, k) });
      hybridItems.push({
        ...item,
        hits: fuseRanks([wide.slice(0, candidateK), keyword], { limit: k }),
      });
    }

    const vector = score(vectorItems);
    const hybrid = score(hybridItems);
    return {
      kept: hybridImproves(vector, hybrid),
      retriever: "vector",
      k,
      minScore,
      candidateK,
      vector,
      hybrid,
    };
  }

  return { compare };
}
