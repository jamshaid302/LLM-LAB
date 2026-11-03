import { useEffect, useState } from "react";

export default function ProvidersPage() {
  const [models, setModels] = useState([]);
  const [hostedExample, setHostedExample] = useState(null);
  const [model, setModel] = useState("");
  const [prompt, setPrompt] = useState("Reply with the single word pong.");
  const [calls, setCalls] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/providers/models").then((res) => res.json()),
      fetch("/api/providers/usage").then((res) => res.json()),
    ])
      .then(([catalog, usage]) => {
        setModels(catalog.models ?? []);
        setHostedExample(catalog.hostedExample ?? null);
        const selected = (catalog.models ?? []).find((item) => item.default) ?? catalog.models?.[0];
        if (selected) setModel(selected.id);
        setCalls(usage.calls ?? []);
      })
      .catch((err) => setError(err.message));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    const text = prompt.trim();
    if (!text || !model || loading) return;

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/providers/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setResult(data);
      const usage = await fetch("/api/providers/usage").then((response) => response.json());
      setCalls(usage.calls ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <p style={styles.note}>
        Both models run locally through the same chat call. The price is $0. The hosted figure
        uses the same token counts times a sample rate, and nothing is billed.
      </p>
      <form onSubmit={handleSubmit} style={styles.form}>
        <select value={model} onChange={(e) => setModel(e.target.value)} style={styles.select} disabled={loading}>
          {models.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label} · ${item.inputPerMillionUsd} / ${item.outputPerMillionUsd} per million
            </option>
          ))}
        </select>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          style={styles.input}
          rows={3}
          disabled={loading}
        />
        <button type="submit" style={styles.sendBtn} disabled={loading || !model}>
          {loading ? "Running..." : "Run"}
        </button>
      </form>
      {error && <p style={styles.error}>{error}</p>}
      {result && (
        <div style={styles.card}>
          <div style={styles.reply}>{result.text}</div>
          <div style={styles.stats}>
            <Stat label="Prompt tokens" value={result.promptTokens ?? "—"} />
            <Stat label="Completion tokens" value={result.completionTokens ?? "—"} />
            <Stat label="Latency" value={`${result.latencyMs} ms`} />
            <Stat label="Cost" value={money(result.costUsd)} />
          </div>
          {hostedExample && (
            <p style={styles.example}>
              Same tokens at a sample hosted rate (${hostedExample.inputPerMillionUsd.toFixed(2)} in / $
              {hostedExample.outputPerMillionUsd.toFixed(2)} out per million): {money(result.hostedExampleUsd, 6)}.
              This call was not billed.
            </p>
          )}
        </div>
      )}
      <h2 style={styles.heading}>Recent calls</h2>
      {calls.length === 0 ? (
        <p style={styles.placeholder}>No calls yet.</p>
      ) : (
        <div style={styles.table}>
          {calls.map((call) => (
            <div key={call.id} style={styles.row}>
              <span>{call.model}</span>
              <span>
                {call.promptTokens ?? "—"} in / {call.completionTokens ?? "—"} out
              </span>
              <span>{call.latencyMs} ms</span>
              <span>{money(call.costUsd)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={styles.statLabel}>{label}</div>
      <div>{value}</div>
    </div>
  );
}

function money(value, digits = 2) {
  if (typeof value !== "number") return "—";
  return `$${value.toFixed(digits)}`;
}

const styles = {
  page: { maxWidth: 760 },
  note: { color: "#94a3b8", fontSize: "0.85rem", marginTop: 0 },
  form: { display: "grid", gap: 8, marginBottom: 12 },
  select: {
    padding: 10,
    borderRadius: 6,
    border: "1px solid #334155",
    background: "#0f172a",
    color: "#e2e8f0",
  },
  input: {
    padding: 10,
    borderRadius: 6,
    border: "1px solid #334155",
    background: "#0f172a",
    color: "#e2e8f0",
    resize: "vertical",
  },
  sendBtn: {
    justifySelf: "start",
    padding: "10px 16px",
    borderRadius: 6,
    border: "none",
    background: "#38bdf8",
    color: "#0f172a",
    fontWeight: 600,
    cursor: "pointer",
  },
  error: { color: "#fca5a5" },
  card: {
    border: "1px solid #334155",
    borderRadius: 8,
    padding: 16,
    background: "#1e293b",
    marginBottom: 18,
  },
  reply: { whiteSpace: "pre-wrap", marginBottom: 12 },
  stats: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 },
  statLabel: { color: "#94a3b8", fontSize: "0.75rem", marginBottom: 4 },
  example: { color: "#cbd5e1", fontSize: "0.85rem", marginBottom: 0 },
  heading: { fontSize: "1rem", marginBottom: 8 },
  placeholder: { color: "#64748b" },
  table: { display: "grid", gap: 6 },
  row: {
    display: "grid",
    gridTemplateColumns: "1.4fr 1.4fr 0.8fr 0.6fr",
    gap: 8,
    color: "#cbd5e1",
    fontSize: "0.85rem",
  },
};
