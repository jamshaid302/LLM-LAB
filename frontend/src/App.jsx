import { Suspense, useEffect, useState } from "react";

import PlannedModule from "./components/PlannedModule.jsx";
import Sidebar from "./components/Sidebar.jsx";
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
  const health = useHealth();

  useEffect(() => {
    const onHashChange = () => setActiveId(currentModuleId());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
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
          <HealthBadge health={health} />
        </header>
        {Page ? (
          <Suspense fallback={<p className="muted">Loading module...</p>}>
            <Page key={active.id} />
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
