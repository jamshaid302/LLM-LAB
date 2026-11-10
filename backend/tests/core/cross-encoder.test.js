import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createCrossEncoder, ensureModelFiles, rerankWithCrossEncoder } from "../../src/core/cross-encoder.js";

/** Scores a passage by how many question words it contains, the way a real model would rank them. */
function fakeLoad() {
  return vi.fn(async () => async (query, passages) => {
    const words = query.toLowerCase().split(/\W+/).filter(Boolean);
    return passages.map((text) => words.filter((word) => text.toLowerCase().includes(word)).length);
  });
}

describe("createCrossEncoder", () => {
  it("loads the model once and scores each passage", async () => {
    const load = fakeLoad();
    const encoder = createCrossEncoder({ model: "fake/model", cacheDir: "unused", load });
    expect(await encoder.score("server room code", ["gym", "server room code is 4829"])).toEqual([0, 3]);
    await encoder.score("gym", ["gym"]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith({ model: "fake/model", cacheDir: "unused" });
  });

  it("returns no scores for no passages without loading the model", async () => {
    const load = fakeLoad();
    const encoder = createCrossEncoder({ load });
    expect(await encoder.score("anything", [])).toEqual([]);
    expect(load).not.toHaveBeenCalled();
  });

  it("tries the load again after a failure", async () => {
    let calls = 0;
    const load = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error("offline");
      return async (_query, passages) => passages.map(() => 1);
    });
    const encoder = createCrossEncoder({ load });
    await expect(encoder.score("q", ["a"])).rejects.toThrow("offline");
    expect(await encoder.score("q", ["a"])).toEqual([1]);
  });

  it("rejects a runner that returns the wrong number of scores", async () => {
    const encoder = createCrossEncoder({ load: async () => async () => [1] });
    await expect(encoder.score("q", ["a", "b"])).rejects.toThrow(/1 scores for 2 passages/);
  });
});

describe("rerankWithCrossEncoder", () => {
  it("orders hits by the cross-encoder and keeps the cosine score for the cutoff", async () => {
    const encoder = createCrossEncoder({ load: fakeLoad() });
    const hits = [
      { text: "The gym is on the 3rd floor.", score: 0.81 },
      { text: "The server room access code is 4829.", score: 0.62 },
    ];
    const ranked = await rerankWithCrossEncoder(hits, "server room access code", encoder);
    expect(ranked[0].text).toContain("4829");
    expect(ranked[0].score).toBe(0.62);
    expect(ranked[0].rerankScore).toBeGreaterThan(ranked[1].rerankScore);
  });
});

describe("ensureModelFiles", () => {
  it("downloads each file once into the cache folder", async () => {
    const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "lab-cross-"));
    const fetchImpl = vi.fn(async (url) => ({ ok: true, arrayBuffer: async () => new TextEncoder().encode(url).buffer }));
    try {
      const first = await ensureModelFiles({ model: "org/name", cacheDir, fetchImpl });
      expect(fetchImpl).toHaveBeenCalledTimes(3);
      expect(await fs.readFile(first["onnx/model_quantized.onnx"], "utf8")).toBe(
        "https://huggingface.co/org/name/resolve/main/onnx/model_quantized.onnx",
      );
      await ensureModelFiles({ model: "org/name", cacheDir, fetchImpl });
      expect(fetchImpl).toHaveBeenCalledTimes(3);
    } finally {
      await fs.rm(cacheDir, { recursive: true, force: true });
    }
  });

  it("reports a failed download with the URL", async () => {
    const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "lab-cross-"));
    try {
      await expect(
        ensureModelFiles({ model: "org/missing", cacheDir, fetchImpl: async () => ({ ok: false, status: 404 }) }),
      ).rejects.toThrow(/org\/missing.*HTTP 404/);
    } finally {
      await fs.rm(cacheDir, { recursive: true, force: true });
    }
  });
});
