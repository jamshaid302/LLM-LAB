import { rerankWithCrossEncoder } from "../../core/cross-encoder.js";

import { fuseRanks, hybridImproves, rankByBm25 } from "./hybrid.js";
import { rerankByOverlap, withParentText } from "./expand.js";

/**
 * Compares vector search with hybrid fusion, two rerankers, and parent-document text on
 * one question set. It does not change the retriever RAG and Semantic Search call.
 * Both rerankers rescore the wide candidate list and keep the top k, so they can recover
 * a chunk the vector pass ranked below k.
 */
export function createAdvancedRagService({
  searchWide,
  listChunks,
  loadSuite,
  score,
  crossEncoder = null,
  retriever = "vector",
  k = 3,
  candidateK = 20,
  minScore,
}) {
  async function compare(userId) {
    const suite = await loadSuite();
    const chunks = await listChunks(userId);
    const vectorItems = [];
    const hybridItems = [];
    const rerankItems = [];
    const crossItems = [];
    const parentItems = [];
    let crossError = null;

    for (const item of [...suite.answerable, ...suite.unanswerable]) {
      const wide = (await searchWide(item.question, userId)).slice(0, candidateK);
      const keyword = rankByBm25(chunks, item.question).slice(0, candidateK);
      const vectorHits = wide.slice(0, k);
      vectorItems.push({ ...item, hits: vectorHits });
      hybridItems.push({ ...item, hits: fuseRanks([wide, keyword], { limit: k }) });
      rerankItems.push({ ...item, hits: rerankByOverlap(wide, item.question).slice(0, k) });
      parentItems.push({ ...item, hits: withParentText(vectorHits, chunks) });
      if (crossEncoder && !crossError) {
        try {
          crossItems.push({ ...item, hits: (await rerankWithCrossEncoder(wide, item.question, crossEncoder)).slice(0, k) });
        } catch (err) {
          crossError = err.message;
        }
      }
    }

    const vector = score(vectorItems);
    const hybrid = score(hybridItems);
    const rerank = score(rerankItems);
    const parent = score(parentItems);
    const cross = crossEncoder && !crossError ? score(crossItems) : null;
    return {
      kept: hybridImproves(vector, hybrid),
      rerankKept: hybridImproves(vector, rerank),
      crossEncoderKept: cross ? hybridImproves(vector, cross) : false,
      parentKept: hybridImproves(vector, parent),
      retriever,
      k,
      minScore,
      candidateK,
      crossEncoderModel: crossEncoder?.model ?? null,
      crossEncoderError: crossEncoder ? crossError : "No cross-encoder configured",
      vector,
      hybrid,
      rerank,
      crossEncoder: cross,
      parent,
    };
  }

  return { compare };
}
