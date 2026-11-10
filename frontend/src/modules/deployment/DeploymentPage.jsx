import { useEffect, useState } from "react";

export default function DeploymentPage() {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/deployment")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        return data;
      })
      .then((data) => {
        if (!cancelled) setInfo(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={styles.page}>
      <p style={styles.note}>
        The API ships as a container. Chroma and Mongo are the Compose services already in this repo. Ollama stays on
        this machine. The usual way to work is still npm run dev.
      </p>
      {error && <p style={styles.error}>{error}</p>}
      {info && (
        <article style={styles.card}>
          <div style={styles.meta}>{info.image}</div>
          <p>Workflow: {info.workflow}</p>
          <p>Frontend image: {info.frontend}</p>
          <p>Ollama: {info.ollama}</p>
          <p>
            Model call: one retry, timeout {Math.round(info.timeoutMs / 1000)}s
          </p>
          <p>Store: {info.store}</p>
          <p style={styles.note}>{info.note}</p>
        </article>
      )}
    </div>
  );
}

const styles = {
  page: { maxWidth: 760 },
  note: { color: "#94a3b8", fontSize: "0.9rem" },
  error: { color: "#fca5a5" },
  card: {
    border: "1px solid #334155",
    borderRadius: 8,
    padding: "10px 12px",
    background: "#1e293b",
  },
  meta: { color: "#38bdf8", fontSize: "0.85rem", marginBottom: 6 },
};
