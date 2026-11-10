const MAX_TRACES = 50;

export function createTraceLog() {
  const traces = [];
  let next = 1;

  return {
    add(record) {
      const saved = {
        id: `trace-${next}`,
        createdAt: new Date().toISOString(),
        route: record.route,
        userId: record.userId ?? null,
        retrievalMs: record.retrievalMs ?? null,
        reranked: record.reranked ?? null,
        rerankMs: record.rerankMs ?? null,
        rerankError: record.rerankError ?? null,
        generationMs: record.generationMs ?? null,
        promptTokens: record.promptTokens ?? null,
        completionTokens: record.completionTokens ?? null,
        refused: Boolean(record.refused),
        sources: (record.sources ?? []).map(brief),
        dropped: (record.dropped ?? []).map(brief),
        error: record.error ?? null,
      };
      next += 1;
      traces.unshift(saved);
      if (traces.length > MAX_TRACES) traces.pop();
      return saved;
    },
    list() {
      return traces.map((trace) => ({
        ...trace,
        sources: trace.sources.map((hit) => ({ ...hit })),
        dropped: trace.dropped.map((hit) => ({ ...hit })),
      }));
    },
    restore(rows) {
      traces.length = 0;
      for (const row of rows.slice(0, MAX_TRACES)) traces.push(row);
      const used = traces.map((row) => Number(String(row.id ?? "").replace("trace-", ""))).filter((value) => Number.isInteger(value));
      next = Math.max(traces.length, ...used, 0) + 1;
    },
  };
}

function brief(hit) {
  return { source: hit.source ?? null, score: hit.score ?? null };
}
