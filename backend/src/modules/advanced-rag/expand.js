import { tokenize } from "./hybrid.js";

/** Overlap with the question breaks ties. The cosine score stays on the hit. */
export function rerankByOverlap(hits, query) {
  const queryTerms = new Set(tokenize(query));
  return [...hits]
    .map((hit) => {
      const terms = tokenize(hit.text);
      const overlap = terms.filter((term) => queryTerms.has(term)).length;
      return { ...hit, overlap };
    })
    .sort(
      (a, b) =>
        b.overlap - a.overlap || (b.score ?? -1) - (a.score ?? -1) || String(a.text).localeCompare(String(b.text)),
    );
}

/** One hit keeps its score and carries every chunk from the same file. */
export function withParentText(hits, chunks) {
  const bySource = new Map();
  for (const chunk of chunks) {
    const source = chunk.source ?? "";
    const list = bySource.get(source) ?? [];
    list.push(chunk.text);
    bySource.set(source, list);
  }
  return hits.map((hit) => {
    const parent = bySource.get(hit.source ?? "");
    if (!parent?.length) return hit;
    return { ...hit, text: parent.join("\n") };
  });
}
