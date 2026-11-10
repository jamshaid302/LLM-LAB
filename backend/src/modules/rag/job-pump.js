/** A fixed window of jobs a second process can claim. */
export function createMemoryJobStore() {
  const jobs = [];

  return {
    async enqueue(id, payload) {
      const current = [...jobs].reverse().find((job) => job.id === id);
      if (current && (current.status === "queued" || current.status === "embedding")) return current;
      if (current && current.status === "failed") {
        current.status = "queued";
        current.error = null;
        current.result = null;
        current.payload = payload;
        return current;
      }
      const job = { id, payload, status: "queued", result: null, error: null };
      jobs.push(job);
      return job;
    },
    async claim() {
      const job = jobs.find((item) => item.status === "queued");
      if (!job) return null;
      job.status = "embedding";
      return job;
    },
    async complete(id, result) {
      const job = [...jobs].reverse().find((item) => item.id === id);
      if (!job) return null;
      job.status = "ready";
      job.result = result;
      return job;
    },
    async fail(id, error) {
      const job = [...jobs].reverse().find((item) => item.id === id);
      if (!job) return null;
      job.status = "failed";
      job.error = error;
      return job;
    },
    async get(id) {
      return [...jobs].reverse().find((job) => job.id === id) ?? null;
    },
  };
}

export async function pumpJobs(store, run, { limit = 20 } = {}) {
  const finished = [];
  for (let count = 0; count < limit; count += 1) {
    const job = await store.claim();
    if (!job) break;
    const id = job.id ?? job._id;
    try {
      const result = await run(job);
      await store.complete(id, result);
      finished.push({ id, status: "ready" });
    } catch (err) {
      await store.fail(id, err.message);
      finished.push({ id, status: "failed" });
    }
  }
  return finished;
}

export function createMongoJobStore(collection) {
  return {
    async enqueue(id, payload) {
      const current = await collection.findOne({ _id: id, status: { $in: ["queued", "embedding"] } });
      if (current) return { id: current._id, status: current.status, result: current.result ?? null, error: current.error ?? null };
      await collection.updateOne(
        { _id: id },
        { $set: { payload, status: "queued", error: null, result: null, updatedAt: new Date() } },
        { upsert: true },
      );
      return { id, payload, status: "queued", result: null, error: null };
    },
    async claim() {
      return collection.findOneAndUpdate(
        { status: "queued" },
        { $set: { status: "embedding", updatedAt: new Date() } },
        { sort: { updatedAt: 1 }, returnDocument: "after" },
      );
    },
    async complete(id, result) {
      await collection.updateOne({ _id: id }, { $set: { status: "ready", result, updatedAt: new Date() } });
    },
    async fail(id, error) {
      await collection.updateOne({ _id: id }, { $set: { status: "failed", error, updatedAt: new Date() } });
    },
    async get(id) {
      const doc = await collection.findOne({ _id: id });
      if (!doc) return null;
      return { id: doc._id, status: doc.status, result: doc.result ?? null, error: doc.error ?? null, payload: doc.payload };
    },
  };
}
