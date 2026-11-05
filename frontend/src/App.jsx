import { Suspense, useEffect, useState } from "react";

import PlannedModule from "./components/PlannedModule.jsx";
import Sidebar from "./components/Sidebar.jsx";
import { USERS, currentUser, setCurrentUser } from "./lib/user.js";
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

  const active = findModule(activeId) ?? findModule(defaultModuleId);
  const { Page } = active;

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
            <label className="user-switch">
              Who is asking
              <select
                value={userId}
                onChange={(event) => {
                  setCurrentUser(event.target.value);
                  setUserId(event.target.value);
                }}
              >
                {USERS.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.label}
                  </option>
                ))}
              </select>
            </label>
            <HealthBadge health={health} />
          </div>
        </header>
        {Page ? (
          <Suspense fallback={<p className="muted">Loading module...</p>}>
            <Page key={`${active.id}:${userId}`} />
          </Suspense>
        ) : (
          <PlannedModule module={active} />
        )}
      </main>
    </div>
  );
}

function HealthBadge({ health }) {
  if (!health) return <span className="health">checking backend...</span>;
  if (health.status !== "ok") return <span className="health down">backend offline</span>;
  return <span className="health ok">{health.chatModel}</span>;
}
