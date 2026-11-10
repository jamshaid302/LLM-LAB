import { useState } from "react";

import { userHeaders } from "../../lib/user.js";

const VERDICT = {
  grounded: "The answer is grounded. The names and codes it uses appear in the kept chunks.",
  replaced: "The answer was replaced. The model wrote something the kept chunks do not support.",
  "search missed": "The search missed. No chunk cleared the cutoff, so the model was not called.",
};

export default function HallucinationPage() {
  const [question, setQuestion] = useState("Who is the CEO of the company?");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function check(event) {
    event.preventDefault();
    const text = question.trim();
    if (!text || loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/hallucination/check", {
        method: "POST",
        headers: userHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ question: text }),
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
        One question goes through the same retrieval and grounding check as the RAG page. A citation-only reply, or a
        name or code that is not in the kept chunks, is replaced with "I don't know". A name the file itself states is
        kept. This is a word check, not a second model.
      </p>
      <form onSubmit={check} style={styles.form}>
        <input value={question} onChange={(event) => setQuestion(event.target.value)} style={styles.input} />
        <button type="submit" disabled={loading} style={styles.button}>
          {loading ? "Checking..." : "Check"}
        </button>
      </form>
      {error && <p style={styles.error}>{error}</p>}
      {result && (
        <article style={styles.card}>
          <div style={styles.meta}>{result.verdict}</div>
          <p>{VERDICT[result.verdict]}</p>
          <p style={styles.note}>{result.answer}</p>
          <p style={styles.note}>
            Kept:{" "}
            {result.sources.length === 0
              ? "none"
              : result.sources.map((hit) => `${hit.source} ${hit.score}`).join(", ")}
          </p>
        </article>
      )}
    </div>
  );
}

const styles = {
  page: { maxWidth: 760 },
  note: { color: "#94a3b8", fontSize: "0.9rem" },
  error: { color: "#fca5a5" },
  form: { display: "flex", gap: 8, margin: "12px 0" },
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
  card: {
    border: "1px solid #334155",
    borderRadius: 8,
    padding: "10px 12px",
    background: "#1e293b",
  },
  meta: { color: "#38bdf8", fontSize: "0.85rem", marginBottom: 6 },
};
