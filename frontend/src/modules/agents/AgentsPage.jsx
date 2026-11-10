import { useState } from "react";

import { userHeaders } from "../../lib/user.js";

function argumentLabel(value) {
  if (value === true) return "valid";
  if (value === false) return "invalid";
  return "no tool call";
}

export default function AgentsPage() {
  const [task, setTask] = useState("Where is the company gym?");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function run(event) {
    event.preventDefault();
    const text = task.trim();
    if (!text || loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/agents/run", {
        method: "POST",
        headers: userHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ task: text }),
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
        The model can call one tool, search_documents. This API runs the search and sends the chunks back. The loop
        stops after 4 steps or 3 minutes. The agent model is separate from the chat model, and a run can take a minute
        on this machine.
      </p>
      <form onSubmit={run} style={styles.form}>
        <input value={task} onChange={(event) => setTask(event.target.value)} style={styles.input} />
        <button type="submit" disabled={loading} style={styles.button}>
          {loading ? "Running..." : "Run"}
        </button>
      </form>
      {error && <p style={styles.error}>{error}</p>}
      {result && (
        <article style={styles.card}>
          <div style={styles.meta}>{result.model}</div>
          <p>
            Finished: {result.finished ? "yes" : "no"}
            {result.stopped ? ` · stopped: ${result.stopped}` : ""}
          </p>
          <p>
            Steps: {result.steps} of {result.maxSteps}
          </p>
          <p>Arguments: {argumentLabel(result.argumentsValid)}</p>
          <p style={styles.note}>{result.answer}</p>
          {result.toolCalls.length === 0 ? (
            <p style={styles.note}>Tool calls: none</p>
          ) : (
            result.toolCalls.map((call, index) => (
              <p key={index} style={styles.note}>
                {call.name} {call.valid ? "valid" : "invalid"}
                {call.arguments?.query ? ` · query: ${call.arguments.query}` : ""}
                {call.error ? ` · ${call.error}` : ""}
                {call.sources
                  ? ` · kept: ${
                      call.sources.length === 0
                        ? "none"
                        : call.sources.map((hit) => `${hit.source} ${hit.score}`).join(", ")
                    }`
                  : ""}
              </p>
            ))
          )}
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
