import { config } from "../../core/config.js";
import { MongoClient } from "mongodb";

import { createObservabilityRouter } from "./router.js";
import { createTraceLog } from "./trace-log.js";

export function createObservabilityModule({ log = createTraceLog(), connect } = {}) {
  let store = "memory";
  return {
    id: "observability",
    name: "Observability",
    router: createObservabilityRouter(log),
    async init() {
      if (!connect) return "memory";
      try {
        const rows = await connect();
        if (Array.isArray(rows) && rows.length > 0) log.restore(rows);
        store = "mongo";
        return `mongo, ${log.list().length} traces`;
      } catch (err) {
        store = "memory";
        return `memory (${err.message})`;
      }
    },
    health() {
      return { traces: log.list().length, store };
    },
  };
}

export async function loadTraces(url = config.mongo.url) {
  const client = new MongoClient(url, { serverSelectionTimeoutMS: 2000 });
  await client.connect();
  const collection = client.db().collection("traces");
  const rows = await collection.find({}).sort({ createdAt: -1 }).limit(50).toArray();
  return { client, collection, rows: rows.map(({ _id, ...row }) => row) };
}

export function persistTrace(collection, record) {
  return collection.insertOne({ ...record, createdAt: record.createdAt ?? new Date().toISOString() });
}
