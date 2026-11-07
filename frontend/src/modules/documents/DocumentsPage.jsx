import { useEffect, useRef, useState } from "react";

import { userHeaders } from "../../lib/user.js";

export default function DocumentsPage() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fileRef = useRef(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancel = false;
    let timer;

    async function poll() {
      try {
        const res = await fetch("/api/documents", { headers: userHeaders() });
        const data = await res.json().catch(() => ({}));
        if (cancel) return;
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        const rows = data.documents ?? [];
        setDocuments(rows);
        setError("");
        if (rows.some((row) => row.status === "queued" || row.status === "embedding")) {
          timer = setTimeout(poll, 400);
        }
      } catch (err) {
        if (!cancel) setError(err.message);
      }
    }

    poll();
    return () => {
      cancel = true;
      clearTimeout(timer);
    };
  }, [refresh]);

  function bump() {
    setRefresh((value) => value + 1);
  }

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || loading) return;

    setLoading(true);
    setError("");
    setNotice("");
    try {
      const pdf = file.name.toLowerCase().endsWith(".pdf");
      const body = pdf
        ? { filename: file.name, data: await fileToBase64(file) }
        : { filename: file.name, text: await file.text() };
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: userHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setNotice(`Saved ${data.filename}. Status: ${data.status}.`);
      bump();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRetry(name) {
    setError("");
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(name)}/retry`, {
        method: "POST",
        headers: userHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setNotice(`Embedding ${data.filename} again.`);
      bump();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRemove(name) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(name)}`, {
        method: "DELETE",
        headers: userHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setNotice(`Removed ${data.filename}. The store now has ${data.chunks} chunks.`);
      bump();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <p style={styles.note}>
        A file is saved, then one worker in this API embeds it. The status moves from queued to embedding, then ready
        or failed. The RAG page uses this same queue.
      </p>
      <div style={styles.actions}>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={loading} style={styles.button}>
          Upload .txt, .md, or .pdf
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf"
          onChange={handleUpload}
          style={{ display: "none" }}
        />
      </div>
      {error && <p style={styles.error}>{error}</p>}
      {notice && <p style={styles.note}>{notice}</p>}
      {documents.length === 0 && <p style={styles.note}>No documents yet.</p>}
      {documents.map((document) => (
        <article key={document.name} style={styles.row}>
          <div>
            <strong>{document.name}</strong>
            <div style={styles.meta}>
              {document.status}
              {document.shared ? " · shared" : ""}
              {typeof document.chunks === "number" ? ` · ${document.chunks} chunks in the store` : ""}
            </div>
            {document.error && <div style={styles.error}>{document.error}</div>}
          </div>
          <div style={styles.actions}>
            {document.removable && document.status === "failed" && (
              <button type="button" onClick={() => handleRetry(document.name)} style={styles.quiet}>
                Retry
              </button>
            )}
            {document.removable && (
              <button type="button" onClick={() => handleRemove(document.name)} disabled={loading} style={styles.quiet}>
                Remove
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

async function fileToBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const size = 0x8000;
  for (let index = 0; index < bytes.length; index += size) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + size, bytes.length)));
  }
  return btoa(binary);
}

const styles = {
  page: { maxWidth: 760 },
  note: { color: "#94a3b8", fontSize: "0.9rem" },
  error: { color: "#fca5a5", fontSize: "0.9rem" },
  actions: { display: "flex", gap: 8, alignItems: "center" },
  button: {
    background: "#38bdf8",
    color: "#0f172a",
    border: "none",
    borderRadius: 8,
    padding: "10px 16px",
    fontWeight: 600,
    cursor: "pointer",
    marginBottom: 12,
  },
  quiet: {
    background: "transparent",
    color: "#fca5a5",
    border: "1px solid #334155",
    borderRadius: 6,
    padding: "4px 8px",
    cursor: "pointer",
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    border: "1px solid #334155",
    borderRadius: 8,
    padding: "10px 12px",
    marginBottom: 8,
    background: "#1e293b",
  },
  meta: { color: "#94a3b8", fontSize: "0.8rem", marginTop: 4 },
};
