import { useState, useRef, useEffect } from "react";

import { readSse } from "../../lib/sse.js";

export default function RagPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [storeName, setStoreName] = useState("");
  const chatEndRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then((data) => setStoreName(data.modules?.rag?.store ?? ""))
      .catch(() => setStoreName(""));
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function patchLast(patch) {
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (!last || last.role !== "bot") return prev;
      next[next.length - 1] = { ...last, ...patch(last) };
      return next;
    });
  }

  function stop() {
    abortRef.current?.abort();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const question = input.trim();
    if (!question || loading) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setMessages((prev) => [...prev, { role: "user", text: question }, { role: "bot", text: "" }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/rag/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      await readSse(res, (event, data) => {
        if (event === "meta") {
          patchLast(() => ({
            sources: data.matchedSources,
            dropped: data.droppedSources,
            refused: data.refused,
          }));
        } else if (event === "token") {
          patchLast((last) => ({ text: last.text + data.text }));
        } else if (event === "error") {
          patchLast((last) => ({ text: last.text || `Error: ${data.error}` }));
        }
      });
    } catch (err) {
      if (err.name === "AbortError") {
        patchLast((last) => ({ stopped: true, text: last.text || "Stopped." }));
      } else {
        patchLast((last) => ({ text: last.text || `Request failed: ${err.message}` }));
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  async function handleReingest() {
    setLoading(true);
    try {
      const res = await fetch("/api/rag/reingest", { method: "POST" });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "bot", text: `✅ Re-ingested ${data.chunks} chunks from the docs folder` },
      ]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: "bot", text: `Re-ingest failed: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  async function handleEval() {
    setLoading(true);
    try {
      const res = await fetch("/api/rag/eval", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setReport(data);
    } catch (err) {
      setMessages((prev) => [...prev, { role: "bot", text: `Score failed: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      {storeName && <p style={styles.report}>Vector store: {storeName}</p>}
      <div style={styles.actions}>
        <button onClick={handleReingest} disabled={loading} style={styles.reingestBtn}>
          Re-ingest docs
        </button>
        <button onClick={handleEval} disabled={loading} style={styles.reingestBtn}>
          Score retrieval
        </button>
      </div>
      {report && (
        <p style={styles.report}>
          Recall@{report.k} before cutoff {(report.recallAtK.before * 100).toFixed(0)}%, after{" "}
          {(report.recallAtK.after * 100).toFixed(0)}%. MRR after {report.mrr.after.toFixed(2)}. Unanswerable
          questions refused by the cutoff: {report.refusedByCutoff}/{report.unanswerable}. Cutoff {report.minScore}.
        </p>
      )}

      <div style={styles.chatBox}>
        {messages.length === 0 && (
          <p style={styles.placeholder}>
            Try asking: "What is RAG?" or "What's the server room code?"
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} style={styles.msg}>
            <span style={m.role === "user" ? styles.userLabel : styles.botLabel}>
              {m.role === "user" ? "You" : "Bot"}:
            </span>{" "}
            {m.text}
            {m.sources && (
              <div style={styles.sources}>
                {m.sources.map((s, j) => (
                  <div key={j}>
                    [{j + 1}] {s.source} (score {s.score}) {s.text.slice(0, 90)}...
                  </div>
                ))}
                {m.dropped?.map((s, j) => (
                  <div key={`d${j}`}>
                    dropped {s.source} (score {s.score}, below cutoff) {s.text.slice(0, 70)}...
                  </div>
                ))}
              </div>
            )}
            {m.stopped && m.text !== "Stopped." && <div style={styles.stopped}>Stopped</div>}
          </div>
        ))}
        {loading && messages.at(-1)?.text === "" && <div style={styles.thinking}>Waiting for the first token...</div>}
        <div ref={chatEndRef} />
      </div>

      <form onSubmit={handleSubmit} style={styles.form}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about the knowledge base..."
          style={styles.input}
          disabled={loading}
        />
        {loading ? (
          <button type="button" onClick={stop} style={styles.stopBtn}>
            Stop
          </button>
        ) : (
          <button type="submit" style={styles.sendBtn}>
            Ask
          </button>
        )}
      </form>
    </div>
  );
}

const styles = {
  page: { maxWidth: 760 },
  actions: { display: "flex", gap: 8, marginBottom: 12 },
  report: { color: "#94a3b8", fontSize: "0.85rem", marginTop: 0 },
  reingestBtn: {
    marginBottom: 12,
    padding: "6px 12px",
    borderRadius: 6,
    border: "1px solid #334155",
    background: "#1e293b",
    color: "#e2e8f0",
    cursor: "pointer",
  },
  chatBox: {
    border: "1px solid #334155",
    borderRadius: 8,
    padding: 16,
    height: 400,
    overflowY: "auto",
    marginBottom: 12,
    background: "#1e293b",
  },
  placeholder: { color: "#64748b" },
  msg: { marginBottom: 14, lineHeight: 1.4 },
  userLabel: { color: "#38bdf8", fontWeight: 600 },
  botLabel: { color: "#e2e8f0", fontWeight: 600 },
  sources: { fontSize: "0.8rem", color: "#94a3b8", marginTop: 4, whiteSpace: "pre-wrap" },
  thinking: { color: "#64748b", fontStyle: "italic" },
  stopped: { color: "#94a3b8", fontSize: "0.8rem", marginTop: 4 },
  stopBtn: {
    padding: "10px 16px",
    borderRadius: 6,
    border: "1px solid #f87171",
    background: "#1e293b",
    color: "#fca5a5",
    fontWeight: 600,
    cursor: "pointer",
  },
  form: { display: "flex", gap: 8 },
  input: {
    flex: 1,
    padding: 10,
    borderRadius: 6,
    border: "1px solid #334155",
    background: "#0f172a",
    color: "#e2e8f0",
  },
  sendBtn: {
    padding: "10px 16px",
    borderRadius: 6,
    border: "none",
    background: "#38bdf8",
    color: "#0f172a",
    fontWeight: 600,
    cursor: "pointer",
  },
};
