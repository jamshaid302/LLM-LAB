import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../../../src/app.js";
import { formatSse } from "../../../src/core/sse.js";
import { createStreamingModule } from "../../../src/modules/streaming/index.js";
import { createStreamingService } from "../../../src/modules/streaming/service.js";

function appWith(streamChat) {
  const service = createStreamingService({ streamChat });
  return { app: createApp([createStreamingModule({ service })]), service };
}

describe("POST /api/streaming/chat", () => {
  it("writes token events and then done", async () => {
    const streamChat = vi.fn(async ({ onToken }) => {
      onToken("Hello");
      onToken(" there");
    });
    const { app } = appWith(streamChat);

    const res = await request(app).post("/api/streaming/chat").send({ message: "Hi" });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
    expect(res.text).toBe(
      formatSse("token", { text: "Hello" }) +
        formatSse("token", { text: " there" }) +
        formatSse("done", { finish: "stop" }),
    );
    expect(streamChat).toHaveBeenCalledOnce();
  });

  it("rejects a missing message with JSON before opening the stream", async () => {
    const streamChat = vi.fn();
    const { app } = appWith(streamChat);

    const res = await request(app).post("/api/streaming/chat").send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Missing 'message'/);
    expect(streamChat).not.toHaveBeenCalled();
  });

  it("reports a model failure as an error event", async () => {
    const { app } = appWith(async () => {
      throw new Error("ollama down");
    });

    const res = await request(app).post("/api/streaming/chat").send({ message: "Hi" });

    expect(res.status).toBe(200);
    expect(res.text).toContain(formatSse("error", { error: "ollama down" }));
  });
});
