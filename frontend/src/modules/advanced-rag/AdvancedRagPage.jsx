import { useState } from "react";

import { userHeaders } from "../../lib/user.js";

export default function AdvancedRagPage() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function compare() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/advanced-rag/compare", { method: "POST", headers: userHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setReport(data);
    } catch (err) {
      setReport(null);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <p style={styles.note}>
        Hybrid search runs a keyword pass (BM25) and the vector pass, then merges the two lists. RAG and Semantic
        Search keep using vector search unless this comparison raises recall, MRR, or the number of unanswerable
        questions the cutoff refuses, without lowering any of those.
      </p>
      <button type="button" onClick={compare} disabled={loading} style={styles.button}>
        {loading ? "Comparing..." : "Compare retrieval"}
      </button>
      {error && <p style={styles.error}>{error}</p>}
      {report && (
        <div>
          <p style={styles.decision}>{report.kept ? keptText : leftOutText}</p>
          <div style={styles.columns}>
            <Report title="Vector" report={report.vector} />
            <Report title="Hybrid" report={report.hybrid} />
          </div>
        </div>
      )}
    </div>
  );
}

const keptText =
  "Hybrid scored higher on this run. RAG and Semantic Search still use vector search until that switch is made.";
const leftOutText =
  "Hybrid did not beat vector search. Vector search stays the retriever for RAG and Semantic Search.";

function Report({ title, report }) {
  return (
    <article style={styles.card}>
      <h2 style={styles.subhead}>{title}</h2>
      <p style={styles.note}>Recall@{report.k} before {(report.recallAtK.before * 100).toFixed(0)}%, after {(report.recallAtK.after * 100).toFixed(0)}%.</p>
      <p style={styles.note}>MRR before {report.mrr.before.toFixed(2)}, after {report.mrr.after.toFixed(2)}.</p>
      <p style={styles.note}>
        Unanswerable questions refused by the cutoff: {report.refusedByCutoff}/{report.unanswerable}.
      </p>
    </article>
  );
}

const styles = {
  page: { maxWidth: 760 },
  note: { color: "#94a3b8", fontSize: "0.9rem" },
  error: { color: "#fca5a5" },
  decision: { fontSize: "1rem" },
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
  columns: { display: "flex", gap: 12, flexWrap: "wrap" },
  card: {
    flex: "1 1 240px",
    border: "1px solid #334155",
    borderRadius: 8,
    padding: "10px 12px",
    background: "#1e293b",
  },
  subhead: { fontSize: "1rem", margin: "0 0 8px" },
};
