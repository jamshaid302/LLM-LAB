/** Drop a chunk whose text is already in an earlier hit. Group the rest by file. */
export function organizeHits(matched, dropped) {
  const kept = [];
  const duplicates = [];
  for (const hit of matched) {
    const text = hit.text.trim();
    const copy = kept.find((item) => item.text.trim() === text || item.text.includes(text) || text.includes(item.text.trim()));
    if (copy) duplicates.push(hit);
    else kept.push(hit);
  }

  const clusters = [];
  for (const hit of kept) {
    const source = hit.source ?? "unknown";
    const cluster = clusters.find((item) => item.source === source);
    if (cluster) cluster.count += 1;
    else clusters.push({ source, count: 1 });
  }

  return {
    matched: kept,
    duplicates,
    clusters,
    related: dropped.slice(0, 3),
  };
}
