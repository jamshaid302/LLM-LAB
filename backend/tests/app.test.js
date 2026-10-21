import { Router } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { createRagModule } from "../src/modules/rag/index.js";

function fakeRagService(overrides = {}) {
  return {
    chunkCount: 7,
    ingest: vi.fn(async () => 7),
    ask: vi.fn(async (question) => ({ answer: `answer to ${question}`, matchedSources: [] })),
    ...overrides,
  };
}

function appWithRag(service = fakeRagService()) {
  return { app: createApp([createRagModule({ service })]), service };
}

describe("platform routes", () => {
  it("lists registered modules", async () => {
    const { app } = appWithRag();
    const res = await request(app).get("/api/modules");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: "rag", name: "RAG" }]);
  });

  it("reports health per module", async () => {
    const { app } = appWithRag();
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body.chatModel).toBeTruthy();
    expect(res.body.modules.rag).toEqual({ chunks: 7 });
  });

  it("mounts each module under its own prefix", async () => {
    const echo = Router().get("/ping", (req, res) => res.json({ from: "echo" }));
    const app = createApp([{ id: "echo", name: "Echo", router: echo }]);

    const res = await request(app).get("/api/echo/ping");
    expect(res.body).toEqual({ from: "echo" });
  });

  it("returns JSON 404 for unknown API routes", async () => {
    const { app } = appWithRag();
    const res = await request(app).get("/api/nope");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/No route/);
  });
});

describe("RAG module routes", () => {
  it("POST /api/rag/ask returns the answer from the service", async () => {
    const { app, service } = appWithRag();
    const res = await request(app).post("/api/rag/ask").send({ question: "What is RAG?" });

    expect(res.status).toBe(200);
    expect(res.body.answer).toBe("answer to What is RAG?");
    expect(service.ask).toHaveBeenCalledWith("What is RAG?");
  });

  it("rejects a missing question with 400 without calling the model", async () => {
    const { app, service } = appWithRag();
    const res = await request(app).post("/api/rag/ask").send({});

    expect(res.status).toBe(400);
    expect(service.ask).not.toHaveBeenCalled();
  });

  it("turns pipeline failures into a 500 JSON error", async () => {
    const service = fakeRagService({
      ask: vi.fn(async () => {
        throw new Error("ollama down");
      }),
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { app } = appWithRag(service);

    const res = await request(app).post("/api/rag/ask").send({ question: "hi" });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("ollama down");
  });

  it("POST /api/rag/reingest rebuilds the store", async () => {
    const { app, service } = appWithRag();
    const res = await request(app).post("/api/rag/reingest");

    expect(res.body).toEqual({ status: "ok", chunks: 7 });
    expect(service.ingest).toHaveBeenCalledOnce();
  });
});
