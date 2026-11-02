import { useEffect, useRef, useState } from "react";

import { readSse } from "../../lib/sse.js";

export default function ConversationsPage() {
  const [threads, setThreads] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [summary, setSummary] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef(null);

  async function loadThreads() {
    const res = await fetch("/api/conversations/threads");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    setThreads(data.threads);
    return data.threads;
  }

  async function openThread(id) {
    setActiveId(id);
    setError("");
    const res = await fetch(`/api/conversations/threads/${id}/messages`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    setMessages(data.messages);
    setSummary(data.summary || "");
  }

  useEffect(() => {
    loadThreads()
      .then((threads) => {
        if (threads?.[0]) return openThread(threads[0].id);
      })
      .catch((err) => setError(err.message));
    // The thread list is loaded once. Sending a message refreshes it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function newThread() {
    setError("");
    const res = await fetch("/api/conversations/threads", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || `HTTP ${res.status}`);
      return;
    }
    setThreads((prev) => [data, ...prev]);
    setActiveId(data.id);
    setMessages([]);
    setSummary("");
  }

  function patchLast(patch) {
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (!last || last.role !== "assistant") return prev;
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
    if (!message || loading || !activeId) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setMessages((prev) => [...prev, { role: "user", content: message }, { role: "assistant", content: "" }]);
    setInput("");
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/conversations/threads/${activeId}/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      await readSse(res, (event, data) => {
        if (event === "meta") {
          if (data.summary) setSummary(data.summary);
          patchLast(() => ({ sources: data.sources }));
        }
        if (event === "token") patchLast((last) => ({ content: last.content + data.text }));
        if (event === "done" && data.finish === "stopped") patchLast(() => ({ stopped: true }));
        if (event === "error") patchLast((last) => ({ content: last.content || `Error: ${data.error}` }));
      });
      await loadThreads();
    } catch (err) {
      if (err.name === "AbortError") {
        patchLast((last) => ({ stopped: true, content: last.content || "Stopped." }));
        await loadThreads().catch(() => {});
      } else {
        setError(err.message);
        patchLast((last) => ({ content: last.content || `Request failed: ${err.message}` }));
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  return (
    <div style={styles.page}>
      <p style={styles.note}>
        Threads are saved in MongoDB. Refresh the page and this chat is still here. Matching
        knowledge-base chunks still come from Chroma.
      </p>
      <div style={styles.threads}>
        <button type="button" onClick={newThread} style={styles.threadBtn}>
          New chat
        </button>
        {threads.map((thread) => (
          <button
            key={thread.id}
            type="button"
            onClick={() => openThread(thread.id).catch((err) => setError(err.message))}
            style={{
              ...styles.threadBtn,
              ...(thread.id === activeId ? styles.threadActive : {}),
            }}
          >
            {thread.title}
          </button>
        ))}
      </div>
      {error && <p style={styles.error}>{error}</p>}
      <div style={styles.chatBox}>
        {summary && (
          <div style={styles.summary}>
            <div style={styles.summaryLabel}>Earlier messages summarized</div>
            {summary}
          </div>
        )}
        {messages.length === 0 && (
          <p style={styles.placeholder}>
            {activeId
              ? "Say something. The next reply can use what you already said."
              : "Start a new chat."}
          </p>
        )}
        {messages.map((message, index) => (
          <div key={message.id ?? index} style={styles.msg}>
            <span style={message.role === "user" ? styles.userLabel : styles.botLabel}>
              {message.role === "user" ? "You" : "Bot"}:
            </span>{" "}
            {message.content}
            {message.sources?.length > 0 && (
              <div style={styles.sources}>
                {message.sources.map((source, sourceIndex) => (
                  <div key={sourceIndex}>
                    [{sourceIndex + 1}] {source.source} (score {source.score}) {source.text.slice(0, 90)}
                  </div>
                ))}
              </div>
            )}
            {message.stopped && message.content !== "Stopped." && <div style={styles.stopped}>Stopped</div>}
          </div>
        ))}
        {loading && messages.at(-1)?.content === "" && (
          <div style={styles.thinking}>Waiting for the first token...</div>
        )}
      </div>
      <form onSubmit={handleSubmit} style={styles.form}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Continue the conversation..."
          style={styles.input}
          disabled={loading || !activeId}
        />
        {loading ? (
          <button type="button" onClick={stop} style={styles.stopBtn}>
            Stop
          </button>
        ) : (
          <button type="submit" style={styles.sendBtn} disabled={!activeId}>
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
  threads: { display: "flex", gap: 8, overflowX: "auto", marginBottom: 12 },
  threadBtn: {
    padding: "6px 12px",
    borderRadius: 6,
    border: "1px solid #334155",
    background: "#1e293b",
    color: "#e2e8f0",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  threadActive: { borderColor: "#38bdf8", color: "#38bdf8" },
  error: { color: "#fca5a5", fontSize: "0.85rem" },
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
  summary: {
    border: "1px solid #334155",
    borderRadius: 6,
    padding: 10,
    marginBottom: 14,
    color: "#cbd5e1",
    fontSize: "0.85rem",
  },
  summaryLabel: { color: "#94a3b8", fontSize: "0.75rem", marginBottom: 4 },
  msg: { marginBottom: 14, lineHeight: 1.4, whiteSpace: "pre-wrap" },
  userLabel: { color: "#38bdf8", fontWeight: 600 },
  botLabel: { color: "#e2e8f0", fontWeight: 600 },
  sources: { fontSize: "0.8rem", color: "#94a3b8", marginTop: 4 },
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
