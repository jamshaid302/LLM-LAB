import { useEffect, useState } from "react";

import { setCsrf, setCurrentUser, userHeaders } from "../../lib/user.js";

export default function SecurityPage() {
  const [policy, setPolicy] = useState(null);
  const [error, setError] = useState("");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/security")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        return data;
      })
      .then((data) => {
        if (!cancelled) setPolicy(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function changePassword(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const res = await fetch("/api/security/password", {
        method: "POST",
        headers: userHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ current, next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setCsrf("");
      setCurrentUser("local");
      setNotice("Password saved. Log in again.");
      window.location.reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const seconds = policy ? Math.round(policy.windowMs / 1000) : null;
  const loginSeconds = policy ? Math.round(policy.loginWindowMs / 1000) : null;

  return (
    <div style={styles.page}>
      <p style={styles.note}>
        Each account has its own uploaded files. Shared samples stay visible to everyone. Ask, stream, and upload share
        one count for the signed-in person. Log out drops that session. A restart drops every session.
      </p>
      {error && <p style={styles.error}>{error}</p>}
      {notice && <p style={styles.note}>{notice}</p>}
      {policy && (
        <article style={styles.card}>
          <div style={styles.meta}>
            {policy.limit} requests / {seconds} seconds
          </div>
          <p style={styles.note}>{policy.note}</p>
          <p style={styles.note}>
            Failed logins stop after {policy.loginMax} tries in {loginSeconds} seconds.
          </p>
          <ul style={styles.list}>
            {policy.routes.map((route) => (
              <li key={route}>{route}</li>
            ))}
          </ul>
        </article>
      )}
      <form onSubmit={changePassword} style={styles.form}>
        <h2 style={styles.meta}>Change password</h2>
        <input
          type="password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          placeholder="Current password"
          style={styles.input}
        />
        <input
          type="password"
          value={next}
          onChange={(event) => setNext(event.target.value)}
          placeholder="New password"
          style={styles.input}
        />
        <button type="submit" disabled={busy} style={styles.button}>
          {busy ? "Saving..." : "Save password"}
        </button>
      </form>
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
  list: { color: "#e2e8f0", fontSize: "0.9rem", paddingLeft: 18 },
  form: { display: "grid", gap: 8, maxWidth: 360, marginTop: 16 },
  input: {
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
    width: "fit-content",
  },
};
