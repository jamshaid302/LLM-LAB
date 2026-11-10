import { useEffect, useState } from "react";

export default function ObservabilityPage() {
  const [traces, setTraces] = useState([]);
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/observability/traces");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    setTraces(data.traces ?? []);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  return (
    <div style={styles.page}>
      <p style={styles.note}>
        Each RAG or chat request leaves one trace: how long retrieval took, how long the model took, the token counts,
        and which chunks were kept. The question text is not stored. An empty source list means the search missed. Sources
        plus a refusal means the answer was replaced after the model wrote it.
      </p>
      <button
        type="button"
        style={styles.button}
        onClick={() => load().catch((err) => setError(err.message))}
      >
        Refresh
      </button>
      {error && <p style={styles.error}>{error}</p>}
      {traces.length === 0 && <p style={styles.note}>No traces yet. Ask a question on RAG, then come back.</p>}
      {traces.map((trace) => (
        <article key={trace.id} style={styles.card}>
          <div style={styles.meta}>
            {trace.route}
            {trace.userId ? ` · ${trace.userId}` : ""} · {labelFor(trace)}
          </div>
          <p style={styles.note}>
            Retrieval {ms(trace.retrievalMs)}. Generation {ms(trace.generationMs)}. Tokens {trace.promptTokens ?? "—"} in
            / {trace.completionTokens ?? "—"} out.
          </p>
          {trace.reranked !== null && trace.reranked !== undefined && (
            <p style={styles.note}>
              {trace.reranked
                ? `Reranked by the cross-encoder in ${ms(trace.rerankMs)}.`
                : `Not reranked${trace.rerankError ? `: ${trace.rerankError}` : ""}.`}
            </p>
          )}
          <p style={styles.note}>Kept: {names(trace.sources)}</p>
          {trace.dropped?.length > 0 && <p style={styles.note}>Dropped: {names(trace.dropped)}</p>}
          {trace.error && <p style={styles.error}>{trace.error}</p>}
        </article>
      ))}
    </div>
  );
}

function labelFor(trace) {
  if (trace.error) return "error";
  if (trace.refused && (trace.sources ?? []).length === 0) return "search missed";
  if (trace.refused) return "answer replaced";
  return "answered";
}

function ms(value) {
  return value == null ? "—" : `${value} ms`;
}

function names(hits) {
  if (!hits?.length) return "none";
  return hits.map((hit) => `${hit.source ?? "unknown"} ${hit.score ?? ""}`.trim()).join(", ");
}

const styles = {
  page: { maxWidth: 760 },
  note: { color: "#94a3b8", fontSize: "0.9rem" },
  error: { color: "#fca5a5" },
  button: {
    background: "#38bdf8",
    color: "#0f172a",
    border: "none",
    borderRadius: 8,
    padding: "10px 16px",
    fontWeight: 600,
    cursor: "pointer",
    marginBottom: 16,
  },
  card: {
    border: "1px solid #334155",
    borderRadius: 8,
    padding: "10px 12px",
    marginBottom: 8,
    background: "#1e293b",
  },
  meta: { color: "#38bdf8", fontSize: "0.85rem", marginBottom: 6 },
};
