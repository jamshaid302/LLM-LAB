import { describe, expect, it } from "vitest";

import { createMemoryJobStore, pumpJobs } from "../../../src/modules/rag/job-pump.js";

describe("embed job pump", () => {
  it("claims a queued file once and records the result", async () => {
    const store = createMemoryJobStore();
    await store.enqueue("local/parking.md", { userId: "local", name: "parking.md" });
    await store.enqueue("local/parking.md", { userId: "local", name: "parking.md" });

    const seen = [];
    const finished = await pumpJobs(store, async (job) => {
      seen.push(job.id);
      return { chunks: 2 };
    });

    expect(seen).toEqual(["local/parking.md"]);
    expect(finished).toEqual([{ id: "local/parking.md", status: "ready" }]);
    expect((await store.get("local/parking.md")).status).toBe("ready");
    expect((await store.get("local/parking.md")).result.chunks).toBe(2);
  });

  it("marks a failed embed and lets the file be queued again", async () => {
    const store = createMemoryJobStore();
    await store.enqueue("local/parking.md", {});
    await pumpJobs(store, async () => {
      throw new Error("embed down");
    });
    expect((await store.get("local/parking.md")).status).toBe("failed");

    const again = await store.enqueue("local/parking.md", {});
    expect(again.status).toBe("queued");
    expect((await store.get("local/parking.md")).status).toBe("queued");
  });
});
