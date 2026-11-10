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
        Every pass starts from the same top 20 vector hits and keeps 3. Hybrid merges them with a keyword (BM25) list.
        Overlap reorders them by shared words. The cross-encoder reads the question and each chunk together and
        rescores them. Parent document attaches the rest of the same file to each vector hit. A pass is only adopted
        when it raises recall, MRR, or the number of unanswerable questions the cutoff refuses, and lowers none of them.
      </p>
      <p style={styles.note}>The first compare can take a minute: it embeds every question and loads the cross-encoder.</p>
      <button type="button" onClick={compare} disabled={loading} style={styles.button}>
        {loading ? "Comparing..." : "Compare retrieval"}
      </button>
      {error && <p style={styles.error}>{error}</p>}
      {report && (
        <div>
          <p style={styles.decision}>RAG answers with: {report.retriever}.</p>
          {report.crossEncoderError && <p style={styles.note}>Cross-encoder not scored: {report.crossEncoderError}</p>}
          <div style={styles.columns}>
            <Report title="Vector" report={report.vector} />
            <Report title="Hybrid" report={report.hybrid} kept={report.kept} />
            <Report title="Overlap rerank" report={report.rerank} kept={report.rerankKept} />
            <Report
              title={`Cross-encoder${report.crossEncoderModel ? ` (${report.crossEncoderModel})` : ""}`}
              report={report.crossEncoder}
              kept={report.crossEncoderKept}
            />
            <Report title="Parent document" report={report.parent} kept={report.parentKept} />
          </div>
        </div>
      )}
    </div>
  );
}

function Report({ title, report, kept }) {
  if (!report) return null;
  const missed = (report.details ?? []).filter((row) => !row.foundAfter);
  return (
    <article style={styles.card}>
      <h2 style={styles.subhead}>{title}</h2>
      {typeof kept === "boolean" && (
        <p style={styles.note}>{kept ? "Scored higher than vector, nothing fell." : "Did not beat vector search."}</p>
      )}
      <p style={styles.note}>Recall@{report.k} before {(report.recallAtK.before * 100).toFixed(0)}%, after {(report.recallAtK.after * 100).toFixed(0)}%.</p>
      <p style={styles.note}>MRR before {report.mrr.before.toFixed(2)}, after {report.mrr.after.toFixed(2)}.</p>
      <p style={styles.note}>
        Unanswerable questions refused by the cutoff: {report.refusedByCutoff}/{report.unanswerable}.
      </p>
      {missed.length > 0 && (
        <details>
          <summary style={styles.note}>Missed {missed.length}</summary>
          {missed.map((row) => (
            <p key={row.question} style={styles.small}>
              {row.question}
            </p>
          ))}
        </details>
      )}
    </article>
  );
}

const styles = {
  page: { maxWidth: 900 },
  note: { color: "#94a3b8", fontSize: "0.9rem" },
  small: { color: "#94a3b8", fontSize: "0.8rem", margin: "4px 0" },
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
