import { useState } from "react";

import { userHeaders } from "../../lib/user.js";

export default function EvaluationPage() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/evaluation/run", { method: "POST", headers: userHeaders() });
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

  const rows = [
    ...(report?.details ?? []).map((row) => ({
      question: row.question,
      outcome: row.foundAfter ? "found" : "missed",
      score: row.topScore,
    })),
    ...(report?.unanswerableDetails ?? []).map((row) => ({
      question: row.question,
      outcome: row.refused ? "refused" : "not refused",
      score: row.topScore,
    })),
  ];

  return (
    <div style={styles.page}>
      <p style={styles.note}>
        This scores the saved question set. Recall@k asks whether the right chunk was in the top k. It does not call
        the chat model. An LLM judge and a CI gate are not part of this page.
      </p>
      <button type="button" onClick={run} disabled={loading} style={styles.button}>
        {loading ? "Scoring..." : "Score question set"}
      </button>
      {error && <p style={styles.error}>{error}</p>}
      {report && (
        <div>
          <p style={styles.note}>
            Recall@{report.k} before {(report.recallAtK.before * 100).toFixed(0)}%, after{" "}
            {(report.recallAtK.after * 100).toFixed(0)}%. MRR after {report.mrr.after.toFixed(2)}. Unanswerable
            refused by the cutoff: {report.refusedByCutoff}/{report.unanswerable}. Cutoff {report.minScore}.
          </p>
          {rows.map((row) => (
            <article key={row.question} style={styles.card}>
              <div style={styles.meta}>
                {row.outcome}
                {row.score == null ? "" : ` · top score ${Number(row.score).toFixed(3)}`}
              </div>
              <p style={styles.note}>{row.question}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  page: { maxWidth: 760 },
  note: { color: "#94a3b8", fontSize: "0.9rem", margin: "4px 0" },
  error: { color: "#fca5a5" },
  button: {
    background: "#38bdf8",
    color: "#0f172a",
    border: "none",
    borderRadius: 8,
    padding: "10px 16px",
    fontWeight: 600,
    cursor: "pointer",
    margin: "12px 0",
  },
  card: {
    border: "1px solid #334155",
    borderRadius: 8,
    padding: "10px 12px",
    marginBottom: 8,
    background: "#1e293b",
  },
  meta: { color: "#38bdf8", fontSize: "0.85rem" },
};
