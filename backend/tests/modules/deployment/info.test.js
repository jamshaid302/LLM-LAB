import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../../../src/app.js";
import { createDeploymentModule } from "../../../src/modules/deployment/index.js";

describe("deployment", () => {
  it("names the image and the test workflow", async () => {
    const app = createApp([createDeploymentModule()]);
    const res = await request(app).get("/api/deployment");

    expect(res.status).toBe(200);
    expect(res.body.image).toBe("backend/Dockerfile");
    expect(res.body.workflow).toBe(".github/workflows/test.yml");
    expect(res.body.ollama).toMatch(/^http/);
    expect(res.body.note).toMatch(/does not score retrieval/);
    expect(res.body.retries).toBe(1);
    expect(res.body.timeoutMs).toBeGreaterThan(0);
  });
});
