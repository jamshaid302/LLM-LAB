import { Suspense, useEffect, useState } from "react";

import PlannedModule from "./components/PlannedModule.jsx";
import Sidebar from "./components/Sidebar.jsx";
import { currentUser, setCsrf, setCurrentUser, userHeaders } from "./lib/user.js";
import { defaultModuleId, findModule, modules } from "./modules/registry.js";

function currentModuleId() {
  return window.location.hash.replace(/^#\/?/, "") || defaultModuleId;
}

function useHealth() {
  const [health, setHealth] = useState(null);
  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then(setHealth)
      .catch(() => setHealth({ status: "down" }));
  }, []);
  return health;
}

export default function App() {
  const [activeId, setActiveId] = useState(currentModuleId);
  const [userId, setUserId] = useState(currentUser);
  const [session, setSession] = useState(null);
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("login");
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const health = useHealth();

  useEffect(() => {
    const onHashChange = () => setActiveId(currentModuleId());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    const onUser = () => setUserId(currentUser());
    window.addEventListener("lab-user", onUser);
    return () => window.removeEventListener("lab-user", onUser);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/security/session")
      .then(async (res) => {
        if (!res.ok) return null;
        const data = await res.json().catch(() => ({}));
        return data.userId ? data : null;
      })
      .then((data) => {
        if (cancelled) return;
        if (data?.userId) {
          setCurrentUser(data.userId);
          setUserId(data.userId);
          setCsrf(data.csrf);
          setSession(data.userId);
        } else {
          setSession(false);
        }
      })
      .catch(() => {
        if (!cancelled) setSession(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function login(event) {
    event.preventDefault();
    if (loginBusy) return;
    setLoginBusy(true);
    setLoginError("");
    try {
      const path = mode === "register" ? "/api/security/register" : "/api/security/login";
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setCurrentUser(data.userId);
      setUserId(data.userId);
      setCsrf(data.csrf);
      setSession(data.userId);
      setPassword("");
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setLoginBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/security/logout", { method: "POST", headers: userHeaders() }).catch(() => {});
    setCsrf("");
    setSession(false);
  }

  const active = findModule(activeId) ?? findModule(defaultModuleId);
  const { Page } = active;
  const signedIn = typeof session === "string";

  return (
    <div className="layout">
      <Sidebar modules={modules} activeId={active.id} />
      <main className="content">
        <header className="content-header">
          <div>
            <h1>{active.name}</h1>
            <p className="muted">{active.description}</p>
          </div>
          <div className="header-tools">
            {signedIn && (
              <div className="user-switch">
                <span>{userId}</span>
                <button type="button" onClick={logout} style={logoutStyle}>
                  Log out
                </button>
              </div>
            )}
            <HealthBadge health={health} />
          </div>
        </header>
        {session === null && <p className="muted">Checking login...</p>}
        {session === false && (
          <form onSubmit={login} style={loginStyle.form}>
            <p className="muted">
              {mode === "register"
                ? "Create an account. The id is 3 to 20 letters and numbers. That person gets their own files."
                : "Log in. Local and Guest start as local and guest. A new account uses the id you created."}
            </p>
            <label className="user-switch">
              Account
              <input
                value={userId}
                onChange={(event) => setUserId(event.target.value.trim().toLowerCase())}
                style={loginStyle.input}
                autoComplete="username"
              />
            </label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              style={loginStyle.input}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
            />
            <button type="submit" disabled={loginBusy} style={loginStyle.button}>
              {loginBusy ? "Checking..." : mode === "register" ? "Create account" : "Log in"}
            </button>
            <button
              type="button"
              style={logoutStyle}
              onClick={() => {
                setMode(mode === "register" ? "login" : "register");
                setLoginError("");
              }}
            >
              {mode === "register" ? "I already have an account" : "Create an account"}
            </button>
            {loginError && <p style={{ color: "#fca5a5" }}>{loginError}</p>}
          </form>
        )}
        {signedIn &&
          (Page ? (
            <Suspense fallback={<p className="muted">Loading module...</p>}>
              <Page key={`${active.id}:${userId}`} />
            </Suspense>
          ) : (
            <PlannedModule module={active} />
          ))}
      </main>
    </div>
  );
}

function HealthBadge({ health }) {
  if (!health) return <span className="health">checking backend...</span>;
  if (health.status !== "ok") return <span className="health down">backend offline</span>;
  return <span className="health ok">{health.chatModel}</span>;
}

const logoutStyle = {
  marginLeft: 8,
  background: "transparent",
  color: "#e2e8f0",
  border: "1px solid #334155",
  borderRadius: 8,
  padding: "6px 10px",
  cursor: "pointer",
};

const loginStyle = {
  form: { maxWidth: 420, display: "grid", gap: 12 },
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
