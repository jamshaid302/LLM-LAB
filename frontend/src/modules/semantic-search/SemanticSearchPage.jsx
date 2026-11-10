import { useState } from "react";

import { userHeaders } from "../../lib/user.js";

export default function SemanticSearchPage() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    const text = query.trim();
    if (!text || loading) return;

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/semantic-search/query", {
        method: "POST",
        headers: userHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ query: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setResult(data);
    } catch (err) {
      setResult(null);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <p style={styles.note}>
        This page embeds your words and returns the nearest chunks. It does not ask the chat model to write an answer.
      </p>
      <form onSubmit={handleSubmit} style={styles.form}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search the knowledge base..."
          style={styles.input}
          disabled={loading}
        />
        <button type="submit" style={styles.button} disabled={loading}>
          {loading ? "Searching..." : "Search"}
        </button>
      </form>
      {error && <p style={styles.error}>{error}</p>}
      {result && (
        <div>
          <p style={styles.note}>
            Cutoff {result.minScore}. Kept {result.matched.length}. Below the cutoff {result.dropped.length}.
            {result.duplicates?.length ? ` Repeated chunks set aside: ${result.duplicates.length}.` : ""}
          </p>
          {result.clusters?.length > 0 && (
            <p style={styles.note}>
              Files: {result.clusters.map((cluster) => `${cluster.source} (${cluster.count})`).join(", ")}
            </p>
          )}
          {result.matched.length === 0 && (
            <p style={styles.note}>Nothing scored high enough to keep.</p>
          )}
          {result.matched.map((hit, index) => (
            <Hit key={`kept-${index}`} hit={hit} />
          ))}
          {result.dropped.length > 0 && (
            <h2 style={styles.subhead}>Below the cutoff (the first three are the nearest misses)</h2>
          )}
          {result.dropped.map((hit, index) => (
            <Hit key={`dropped-${index}`} hit={hit} dim />
          ))}
        </div>
      )}
    </div>
  );
}

function Hit({ hit, dim = false }) {
  return (
    <article style={{ ...styles.hit, ...(dim ? styles.dim : null) }}>
      <div style={styles.meta}>
        {hit.source ?? "unknown"} · score {hit.score}
      </div>
      <p style={styles.text}>{hit.text}</p>
    </article>
  );
}

const styles = {
  page: { maxWidth: 760 },
  note: { color: "#94a3b8", fontSize: "0.9rem" },
  form: { display: "flex", gap: 8, marginBottom: 16 },
  input: {
    flex: 1,
    background: "#0f172a",
    color: "#e2e8f0",
    border: "1px solid #334155",
    borderRadius: 8,
    padding: "10px 12px",
  },
  button: {
    background: "#38bdf8",
    color: "#0f172a",
    border: "none",
    borderRadius: 8,
    padding: "10px 16px",
    fontWeight: 600,
    cursor: "pointer",
  },
  error: { color: "#fca5a5" },
  subhead: { fontSize: "0.95rem", margin: "16px 0 8px" },
  hit: {
    border: "1px solid #334155",
    borderRadius: 8,
    padding: "10px 12px",
    marginBottom: 8,
    background: "#1e293b",
  },
  dim: { opacity: 0.7 },
  meta: { color: "#38bdf8", fontSize: "0.8rem", marginBottom: 6 },
  text: { margin: 0, whiteSpace: "pre-wrap" },
};
