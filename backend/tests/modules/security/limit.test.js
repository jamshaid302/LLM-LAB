import { Router } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../../../src/app.js";
import { createSecurityModule } from "../../../src/modules/security/index.js";

function stub(id, handlers) {
  const router = Router();
  for (const [method, path] of handlers) {
    router[method](path, (req, res) => res.json({ ok: true }));
  }
  return { id, name: id, router };
}

function appAt({ limit = 2, windowMs = 60_000, now = () => 0 } = {}) {
  return createApp([
    createSecurityModule({ limit, windowMs, now }),
    stub("rag", [
      ["post", "/ask"],
      ["post", "/stream"],
      ["post", "/documents"],
      ["get", "/documents"],
      ["post", "/documents/:filename/retry"],
      ["post", "/reingest"],
    ]),
    stub("documents", [["post", "/"]]),
    stub("streaming", [["post", "/chat"]]),
    stub("conversations", [["post", "/threads/:id/stream"]]),
    stub("evaluation", [["post", "/run"]]),
  ]);
}

describe("rate limit", () => {
  it("returns 429 after the budget and allows a request in the next window", async () => {
    let time = 1_000_000;
    const app = appAt({ now: () => time });

    expect((await request(app).post("/api/rag/ask")).status).toBe(200);
    expect((await request(app).post("/api/rag/stream")).status).toBe(200);
    const blocked = await request(app).post("/api/streaming/chat");
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe("Too many requests");
    expect(blocked.headers["retry-after"]).toBe("60");

    time += 60_000;
    expect((await request(app).post("/api/rag/ask")).status).toBe(200);
  });

  it("keeps Local, Guest, and unknown ids in separate buckets", async () => {
    const app = appAt();

    await request(app).post("/api/rag/ask");
    await request(app).post("/api/rag/ask").set("X-User-Id", "local");
    const localBlocked = await request(app).post("/api/rag/ask");
    expect(localBlocked.status).toBe(429);

    const guest = await request(app).post("/api/rag/ask").set("X-User-Id", "guest");
    expect(guest.status).toBe(200);

    await request(app).post("/api/documents").set("X-User-Id", "bob");
    await request(app).post("/api/rag/documents").set("X-User-Id", "alice");
    const shared = await request(app).post("/api/conversations/threads/abc/stream").set("X-User-Id", "carol");
    expect(shared.status).toBe(429);
  });

  it("does not count list, retry, re-ingest, or evaluation", async () => {
    const app = appAt();
    await request(app).post("/api/rag/ask");
    await request(app).post("/api/rag/ask");

    expect((await request(app).get("/api/rag/documents")).status).toBe(200);
    expect((await request(app).post("/api/rag/documents/note.md/retry")).status).toBe(200);
    expect((await request(app).post("/api/rag/reingest")).status).toBe(200);
    expect((await request(app).post("/api/evaluation/run")).status).toBe(200);

    const upload = await request(app).post("/api/documents");
    expect(upload.status).toBe(429);
  });

  it("reports the policy", async () => {
    const app = appAt({ limit: 20, windowMs: 60_000 });
    const res = await request(app).get("/api/security");
    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(20);
    expect(res.body.windowMs).toBe(60_000);
    expect(res.body.routes).toContain("POST /api/rag/ask");
    expect(res.body.routes).toContain("POST /api/conversations/threads/:id/stream");
  });
});
