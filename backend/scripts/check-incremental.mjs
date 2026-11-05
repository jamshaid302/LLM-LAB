import fs from "node:fs/promises";
import path from "node:path";

const file = path.resolve("src/modules/rag/docs/parking.md");
const base = "http://127.0.0.1:5001";

async function json(url, options) {
  const res = await fetch(url, options);
  return { status: res.status, body: await res.json() };
}

const before = await json(`${base}/api/health`);
const started = Date.now();
const saved = await json(`${base}/api/rag/documents`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    filename: "parking.md",
    text: "The visitor parking code is maple-17 and is printed on the garage door.",
  }),
});
const uploadMs = Date.now() - started;
const removeStarted = Date.now();
const removed = await json(`${base}/api/rag/documents/parking.md`, { method: "DELETE" });
const removeMs = Date.now() - removeStarted;
await fs.unlink(file).catch(() => {});
const after = await json(`${base}/api/health`);

console.log(JSON.stringify({
  before: before.body.modules?.rag,
  uploadMs,
  saved: saved.body,
  removeMs,
  removed: removed.body,
  after: after.body.modules?.rag,
  fileGone: !(await fs.access(file).then(() => true).catch(() => false)),
}, null, 2));
