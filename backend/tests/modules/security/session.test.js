import { Router } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../../../src/app.js";
import { createSecurityModule } from "../../../src/modules/security/index.js";
import { createSessionAuth } from "../../../src/modules/security/session.js";

function appWith(session) {
  const router = Router();
  router.post("/ask", (req, res) => res.json({ userId: req.get("x-user-id") }));
  return createApp([
    createSecurityModule({ session, limit: 100, windowMs: 60_000, now: () => 0 }),
    { id: "rag", name: "rag", router },
  ]);
}

describe("session login", () => {
  const session = createSessionAuth({
    passwords: { local: "local", guest: "guest" },
    secret: "test-secret",
    ttlMs: 60_000,
    now: () => 1_000,
  });

  it("requires the cookie and ignores a spoofed user header", async () => {
    const app = appWith(session);
    const open = await request(app).post("/api/rag/ask");
    expect(open.status).toBe(401);

    const bad = await request(app).post("/api/security/login").send({ userId: "local", password: "nope" });
    expect(bad.status).toBe(401);

    const login = await request(app).post("/api/security/login").send({ userId: "local", password: "local" });
    expect(login.status).toBe(200);
    const cookie = login.headers["set-cookie"].find((item) => item.startsWith("lab-session=")).split(";")[0];

    const who = await request(app).get("/api/security/session").set("Cookie", cookie);
    expect(who.body.userId).toBe("local");

    const missing = await request(app).post("/api/rag/ask").set("Cookie", cookie);
    expect(missing.status).toBe(403);

    const ask = await request(app)
      .post("/api/rag/ask")
      .set("Cookie", cookie)
      .set("X-CSRF-Token", login.body.csrf)
      .set("X-User-Id", "guest");
    expect(ask.status).toBe(200);
    expect(ask.body.userId).toBe("local");

    const health = await request(app).get("/api/health");
    expect(health.status).toBe(200);
  });
});
