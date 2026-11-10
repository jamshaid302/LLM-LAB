import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createObservabilityModule, loadTraces, persistTrace } from "../../src/modules/observability/index.js";
import { createTraceLog } from "../../src/modules/observability/trace-log.js";

import { liveMongoUrl, openLiveDb } from "./helpers.js";

const dbName = "lab_live_traces";
let live;
const opened = [];

beforeAll(async () => {
  live = await openLiveDb(dbName);
  await live.db.dropDatabase();
});

afterAll(async () => {
  for (const client of opened) await client.close();
  await live?.db.dropDatabase();
  await live?.client.close();
});

async function connect() {
  const loaded = await loadTraces(liveMongoUrl(dbName));
  opened.push(loaded.client);
  return loaded;
}

describe("traces in the running Mongo", () => {
  it("writes traces and restores them into a new process's log", async () => {
    const first = createTraceLog();
    const { collection } = await connect();
    for (const route of ["rag.ask", "rag.stream"]) {
      const saved = first.add({ route, retrievalMs: 5, generationMs: 10, refused: false });
      await persistTrace(collection, saved);
    }

    const log = createTraceLog();
    const module = createObservabilityModule({ log, connect: async () => (await connect()).rows });
    expect(await module.init()).toBe("mongo, 2 traces");
    expect(module.health()).toEqual({ traces: 2, store: "mongo" });
    expect(log.list().map((row) => row.route).sort()).toEqual(["rag.ask", "rag.stream"]);
  });

  it("falls back to memory when Mongo is unreachable", async () => {
    const module = createObservabilityModule({
      log: createTraceLog(),
      connect: () => loadTraces("mongodb://127.0.0.1:1/none"),
    });
    expect(await module.init()).toMatch(/^memory \(/);
    expect(module.health().store).toBe("memory");
  });
});
