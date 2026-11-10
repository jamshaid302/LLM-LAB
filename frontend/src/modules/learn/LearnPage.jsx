import { stages } from "./concepts.js";

const LABELS = {
  built: "built",
  measured: "measured, not used",
  planned: "planned",
  "left out": "left out",
};

export default function LearnPage() {
  const all = stages.flatMap((stage) => stage.concepts);
  const counts = all.reduce((acc, concept) => ({ ...acc, [concept.status]: (acc[concept.status] ?? 0) + 1 }), {});

  return (
    <div style={styles.page}>
      <p style={styles.note}>
        Work top to bottom, or open Conversations and ask what a concept means. Each concept says what it
        is, then where to try it. {counts.built ?? 0} are built and
        tested, {counts.measured ?? 0} are built and measured but not used for answers, {counts.planned ?? 0} are
        explained but not built yet, and {counts["left out"] ?? 0} are left out on purpose.
      </p>
      {stages.map((stage) => (
        <section key={stage.id} style={styles.stage}>
          <h2 style={styles.subhead}>{stage.title}</h2>
          {stage.concepts.map((concept) => (
            <article key={concept.name} style={styles.card}>
              <div style={styles.row}>
                <strong>{concept.name}</strong>
                <span style={{ ...styles.badge, ...badgeColor(concept.status) }}>{LABELS[concept.status]}</span>
              </div>
              <p style={styles.note}>{concept.what}</p>
              <p style={styles.try}>
                <a href={`#/${concept.page}`} style={styles.link}>
                  Try it
                </a>
                : {concept.tryIt}
              </p>
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}

function badgeColor(status) {
  if (status === "built") return { color: "#4ade80", borderColor: "#166534" };
  if (status === "measured") return { color: "#facc15", borderColor: "#854d0e" };
  return { color: "#94a3b8", borderColor: "#334155" };
}

const styles = {
  page: { maxWidth: 820 },
  stage: { marginBottom: 20 },
  subhead: { fontSize: "1.05rem", margin: "16px 0 8px" },
  note: { color: "#94a3b8", fontSize: "0.9rem", margin: "4px 0" },
  try: { color: "#cbd5e1", fontSize: "0.85rem", margin: "6px 0 0" },
  link: { color: "#38bdf8" },
  row: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" },
  badge: { fontSize: "0.75rem", border: "1px solid", borderRadius: 999, padding: "1px 8px", whiteSpace: "nowrap" },
  card: {
    border: "1px solid #334155",
    borderRadius: 8,
    padding: "10px 12px",
    marginBottom: 8,
    background: "#1e293b",
  },
};
