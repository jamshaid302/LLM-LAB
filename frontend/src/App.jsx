import { useState, useRef, useEffect } from "react";

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(e) {
    e.preventDefault();
    const question = input.trim();
    if (!question || loading) return;

    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();

      if (data.error) {
        setMessages((prev) => [...prev, { role: "bot", text: `Error: ${data.error}` }]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "bot", text: data.answer, sources: data.matchedSources },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [...prev, { role: "bot", text: `Request failed: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  async function handleReingest() {
    setLoading(true);
    try {
      const res = await fetch("/api/reingest", { method: "POST" });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "bot", text: `✅ Re-ingested ${data.chunks} chunks from knowledge.txt` },
      ]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: "bot", text: `Re-ingest failed: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>🧠 Local RAG Chatbot</h1>
      <p style={styles.subtitle}>React + Express + LangChain.js + Ollama — 100% free, runs locally</p>

      <button onClick={handleReingest} disabled={loading} style={styles.reingestBtn}>
        Re-ingest docs
      </button>

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
                    [{j + 1}] (score {s.score}) {s.text.slice(0, 90)}...
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {loading && <div style={styles.thinking}>Thinking...</div>}
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
        <button type="submit" style={styles.sendBtn} disabled={loading}>
          Ask
        </button>
      </form>
    </div>
  );
}

const styles = {
  page: {
    fontFamily: "system-ui, sans-serif",
    maxWidth: 700,
    margin: "40px auto",
    background: "#0f172a",
    color: "#e2e8f0",
    padding: "0 16px",
  },
  title: { fontSize: "1.4rem", marginBottom: 4 },
  subtitle: { color: "#94a3b8", marginTop: 0, fontSize: "0.9rem" },
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
