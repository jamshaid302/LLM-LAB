import { useEffect, useState } from "react";

import { userHeaders } from "../../lib/user.js";

const percent = (value) => (typeof value === "number" ? `${(value * 100).toFixed(0)}%` : "n/a");

export default function EvaluationPage() {
  const [report, setReport] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/evaluation/baseline", { headers: userHeaders() })
      .then((res) => (res.ok ? res.json() : null))
      .then(setBaseline)
      .catch(() => setBaseline(null));
  }, []);

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
      twoChunk: Array.isArray(row.expect),
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
        Retrieval is scored here, live. Recall@k asks whether the chunks holding the answer were in the top k. A
        two-chunk question counts only when every fact it needs was retrieved. Answer quality needs the chat model for
        every question, so it is measured from the command line and saved; the saved numbers are below.
      </p>
      {baseline && <SavedBaseline baseline={baseline} />}
      <button type="button" onClick={run} disabled={loading} style={styles.button}>
        {loading ? "Scoring..." : "Score question set"}
      </button>
      {error && <p style={styles.error}>{error}</p>}
      {report && (
        <div>
          <p style={styles.note}>
            Recall@{report.k} before {percent(report.recallAtK.before)}, after {percent(report.recallAtK.after)}. MRR
            after {report.mrr.after.toFixed(2)}. Unanswerable refused by the cutoff: {report.refusedByCutoff}/
            {report.unanswerable}. Cutoff {report.minScore}. {report.reranked ? "Reranked by the cross-encoder." : ""}
          </p>
          {rows.map((row) => (
            <article key={row.question} style={styles.card}>
              <div style={styles.meta}>
                {row.outcome}
                {row.twoChunk ? " · needs two chunks" : ""}
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

function SavedBaseline({ baseline }) {
  const answers = Object.values(baseline.answers ?? {});
  const rerank = baseline.rerank;
  return (
    <section style={styles.card}>
      <h2 style={styles.subhead}>Saved baseline ({baseline.measured ?? "no date"})</h2>
      {baseline.questions && (
        <p style={styles.note}>
          {baseline.questions.answerable} answerable questions ({baseline.questions.multiChunk} need two chunks) and{" "}
          {baseline.questions.unanswerable} the documents cannot answer, over {baseline.chunks} chunks from{" "}
          {baseline.files?.length} files.
        </p>
      )}
      <p style={styles.note}>
        Retrieval: recall@{baseline.k} {percent(baseline.recallAtK?.after)}, MRR {baseline.mrr?.after}, reranker{" "}
        {baseline.reranker ?? "off"}.
      </p>
      {rerank && (
        <p style={styles.note}>
          Rerank comparison: vector {percent(rerank.vector?.recallAfter)} / MRR {rerank.vector?.mrrAfter}, cross-encoder{" "}
          {percent(rerank.crossEncoder?.recallAfter)} / MRR {rerank.crossEncoder?.mrrAfter}, overlap{" "}
          {percent(rerank.overlap?.recallAfter)} / MRR {rerank.overlap?.mrrAfter}.
        </p>
      )}
      {answers.map((entry) => (
        <div key={entry.chatModel}>
          <p style={styles.meta}>Answers from {entry.chatModel}</p>
          <p style={styles.note}>
            Correct by human label {percent(entry.labelCorrect)}, by LLM judge {percent(entry.judgeCorrect)}. The judge
            agreed with the label {percent(entry.judgeAgreement)} of the time. Wrongly refused: {entry.falseRefusals}.
            Unanswerable refused: {entry.refused}/{entry.unanswerable} ({entry.refusedByCutoff} by the cutoff,{" "}
            {entry.refusedAfterRetrieval} by the model or grounding check).
          </p>
          {entry.answeredAnyway?.length > 0 && (
            <p style={styles.note}>Answered when it should have refused: {entry.answeredAnyway.join("; ")}</p>
          )}
        </div>
      ))}
    </section>
  );
}

const styles = {
  page: { maxWidth: 760 },
  note: { color: "#94a3b8", fontSize: "0.9rem", margin: "4px 0" },
  error: { color: "#fca5a5" },
  subhead: { fontSize: "1rem", margin: "0 0 8px" },
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
