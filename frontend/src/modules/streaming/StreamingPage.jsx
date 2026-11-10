import { useRef, useState } from "react";

import { readSse } from "../../lib/sse.js";
import { userHeaders } from "../../lib/user.js";

export default function StreamingPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const abortRef = useRef(null);

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
    const message = input.trim();
    if (!message || loading) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setMessages((prev) => [...prev, { role: "user", text: message }, { role: "bot", text: "" }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/streaming/chat", {
        method: "POST",
        headers: userHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ message }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      await readSse(res, (event, data) => {
        if (event === "token") patchLast((last) => ({ text: last.text + data.text }));
        if (event === "replace") patchLast(() => ({ text: data.text }));
        if (event === "error") patchLast((last) => ({ text: last.text || `Error: ${data.error}` }));
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

  return (
    <div style={styles.page}>
      <p style={styles.note}>
        Tokens arrive as the model writes them. Stop keeps whatever has already landed.
      </p>
      <div style={styles.chatBox}>
        {messages.length === 0 && (
          <p style={styles.placeholder}>Try: "Count slowly from 1 to 10."</p>
        )}
        {messages.map((m, i) => (
          <div key={i} style={styles.msg}>
            <span style={m.role === "user" ? styles.userLabel : styles.botLabel}>
              {m.role === "user" ? "You" : "Bot"}:
            </span>{" "}
            {m.text}
            {m.stopped && m.text !== "Stopped." && <div style={styles.stopped}>Stopped</div>}
          </div>
        ))}
        {loading && messages.at(-1)?.text === "" && <div style={styles.thinking}>Waiting for the first token...</div>}
      </div>
      <form onSubmit={handleSubmit} style={styles.form}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Say something..."
          style={styles.input}
          disabled={loading}
        />
        {loading ? (
          <button type="button" onClick={stop} style={styles.stopBtn}>
            Stop
          </button>
        ) : (
          <button type="submit" style={styles.sendBtn}>
            Send
          </button>
        )}
      </form>
    </div>
  );
}

const styles = {
  page: { maxWidth: 760 },
  note: { color: "#94a3b8", fontSize: "0.85rem", marginTop: 0 },
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
  msg: { marginBottom: 14, lineHeight: 1.4, whiteSpace: "pre-wrap" },
  userLabel: { color: "#38bdf8", fontWeight: 600 },
  botLabel: { color: "#e2e8f0", fontWeight: 600 },
  stopped: { color: "#94a3b8", fontSize: "0.8rem", marginTop: 4 },
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
  stopBtn: {
    padding: "10px 16px",
    borderRadius: 6,
    border: "1px solid #f87171",
    background: "#1e293b",
    color: "#fca5a5",
    fontWeight: 600,
    cursor: "pointer",
  },
};
