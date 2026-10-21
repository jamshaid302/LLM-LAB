export default function PlannedModule({ module }) {
  return (
    <div className="planned">
      <p>This module is planned but not built yet.</p>
      <p className="muted">
        When it lands, it will add a page here and a backend router at{" "}
        <code>/api/{module.id}</code>. See the roadmap in the repository <code>README.md</code>.
      </p>
    </div>
  );
}
