import { HttpError } from "../../core/http.js";

import { organizeHits } from "./organize.js";

const MAX_QUERY = 4000;

/**
 * Semantic search returns the nearest chunks. It does not call a chat model.
 * `search` is injected by the composition root so this module does not import RAG.
 */
export function createSemanticSearchService({ search, minScore }) {
  async function query(text, userId) {
    const question = typeof text === "string" ? text.trim() : "";
    if (!question) throw new HttpError(400, "Missing 'query'");
    if (question.length > MAX_QUERY) {
      throw new HttpError(400, `Query must be at most ${MAX_QUERY} characters`);
    }

    const { matched = [], dropped = [] } = await search(question, userId);
    const organized = organizeHits(matched.map(present), dropped.map(present));
    return {
      query: question,
      minScore,
      matched: organized.matched,
      dropped: dropped.map(present),
      duplicates: organized.duplicates,
      clusters: organized.clusters,
      related: organized.related,
    };
  }

  return {
    query,
    get minScore() {
      return minScore;
    },
  };
}

function present(hit) {
  return {
    text: hit.text,
    score: Number(hit.score).toFixed(3),
    source: hit.source ?? null,
  };
}
