export default function Sidebar({ modules, activeId }) {
  const groups = [...new Set(modules.map((m) => m.group))];

  return (
    <nav className="sidebar">
      <div className="sidebar-brand">AI Engineering Lab</div>
      {groups.map((group) => (
        <div key={group} className="sidebar-group">
          <div className="sidebar-group-label">{group}</div>
          {modules
            .filter((m) => m.group === group)
            .map((m) => (
              <a
                key={m.id}
                href={`#/${m.id}`}
                className={`sidebar-item${m.id === activeId ? " active" : ""}`}
              >
                <span>{m.name}</span>
                {m.status === "planned" && <span className="badge">soon</span>}
              </a>
            ))}
        </div>
      ))}
    </nav>
  );
}
