import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../../../src/app.js";
import { createObservabilityModule } from "../../../src/modules/observability/index.js";
import { createTraceLog } from "../../../src/modules/observability/trace-log.js";

describe("trace restore", () => {
  it("loads saved rows and keeps new traces in memory when the database write fails", async () => {
    const log = createTraceLog();
    const module = createObservabilityModule({
      log,
      connect: async () => [
        {
          id: "trace-4",
          createdAt: "2026-10-29T00:00:00.000Z",
          route: "rag.ask",
          userId: "local",
          retrievalMs: 1,
          generationMs: 2,
          promptTokens: null,
          completionTokens: null,
          refused: false,
          sources: [],
          dropped: [],
          error: null,
        },
      ],
    });

    expect(await module.init()).toMatch(/^mongo/);
    const app = createApp([module]);
    const listed = await request(app).get("/api/observability/traces");
    expect(listed.body.traces[0].id).toBe("trace-4");
    expect(listed.body.traces[0].route).toBe("rag.ask");
    expect(JSON.stringify(listed.body)).not.toMatch(/question/i);
  });
});
