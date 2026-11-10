import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMongoJobStore, pumpJobs } from "../../src/modules/rag/job-pump.js";
import { createRagService } from "../../src/modules/rag/rag-service.js";
import { createMemoryStore } from "../../src/modules/rag/store.js";

import { keywordEmbeddings, openLiveDb } from "./helpers.js";

const dbName = "lab_live_jobs";
let live;
let jobs;
let corpus;

beforeAll(async () => {
  live = await openLiveDb(dbName);
  await live.db.dropDatabase();
  jobs = createMongoJobStore(live.db.collection("embedJobs"));
  corpus = await fs.mkdtemp(path.join(os.tmpdir(), "lab-live-jobs-"));
  await fs.writeFile(path.join(corpus, "knowledge.txt"), "The shared gym is on the 3rd floor.");
});

afterAll(async () => {
  await live?.db.dropDatabase();
  await live?.client.close();
  if (corpus) await fs.rm(corpus, { recursive: true, force: true });
});

describe("external embed worker through the running Mongo", () => {
  it("queues an upload in Mongo, a second service claims it, and the chunk becomes searchable", async () => {
    const embeddings = keywordEmbeddings();
    const vectors = createMemoryStore(embeddings);
    const api = createRagService({ corpusPath: corpus, embeddings, store: vectors, externalJobs: jobs });
    await api.load();

    const accepted = await api.acceptDocument({ filename: "maple.md", text: "Local's maple code is 1111.", userId: "local" });
    expect(accepted.status).toBe("queued");
    expect((await live.db.collection("embedJobs").findOne({ _id: "local/maple.md" })).status).toBe("queued");
    expect(await api.documentStatus("maple.md", "local")).toMatchObject({ status: "queued" });

    const worker = createRagService({ corpusPath: corpus, embeddings, store: vectors, externalJobs: jobs });
    const finished = await pumpJobs(jobs, (job) => worker.runQueued(job.id ?? job._id));
    expect(finished).toEqual([{ id: "local/maple.md", status: "ready" }]);

    expect(await api.documentStatus("maple.md", "local")).toMatchObject({ status: "ready" });
    const hits = await api.retrieve("maple", "local", 1);
    expect(hits[0].text).toContain("maple");
    expect((await api.retrieve("maple", "guest", 3)).some((hit) => hit.text.includes("maple"))).toBe(false);
  });

  it("marks a job failed when the worker throws, and retry queues it again", async () => {
    await jobs.enqueue("local/broken.md", { userId: "local", name: "broken.md" });
    const finished = await pumpJobs(jobs, async () => {
      throw new Error("embedding model is down");
    });
    expect(finished).toEqual([{ id: "local/broken.md", status: "failed" }]);
    expect(await jobs.get("local/broken.md")).toMatchObject({ status: "failed", error: "embedding model is down" });

    const again = await jobs.enqueue("local/broken.md", { userId: "local", name: "broken.md" });
    expect(again.status).toBe("queued");
    await jobs.complete("local/broken.md", { chunks: 0 });
  });

  it("does not let two workers claim the same job", async () => {
    await jobs.enqueue("guest/once.md", { userId: "guest", name: "once.md" });
    const [a, b] = await Promise.all([jobs.claim(), jobs.claim()]);
    const claimed = [a, b].filter(Boolean);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]._id).toBe("guest/once.md");
  });
});
