import { Router } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../../../src/app.js";
import { createAccountStore } from "../../../src/modules/security/accounts.js";
import { createSecurityModule } from "../../../src/modules/security/index.js";
import { createFailureLimiter } from "../../../src/modules/security/login-limit.js";
import { createSessionAuth } from "../../../src/modules/security/session.js";

function sessionCookie(res) {
  const raw = res.headers["set-cookie"];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.find((item) => item.startsWith("lab-session=")).split(";")[0];
}

function appWith(session, accounts, failures) {
  const router = Router();
  router.post("/ask", (req, res) => res.json({ userId: req.labUserId }));
  return createApp([
    createSecurityModule({ session, accounts, limit: 100, windowMs: 60_000, now: () => 0, failures }),
    { id: "rag", name: "rag", router },
  ]);
}

describe("accounts and sessions", () => {
  const accounts = createAccountStore();
  const session = createSessionAuth({
    accounts,
    passwords: { local: "local", guest: "guest" },
    secret: "test-secret",
    ttlMs: 60_000,
    now: () => 1_000,
  });

  it("registers a person, keeps their files behind their session, and revokes logout", async () => {
    const app = appWith(session, accounts);
    const created = await request(app).post("/api/security/register").send({ userId: "Sam", password: "sam-secret" });
    expect(created.status).toBe(200);
    expect(created.body.userId).toBe("sam");
    expect(created.headers["set-cookie"].some((item) => item.startsWith("lab-session=") && item.includes("HttpOnly"))).toBe(
      true,
    );
    expect(created.headers["set-cookie"].some((item) => item.startsWith("lab-csrf=") && !item.includes("HttpOnly"))).toBe(
      true,
    );

    const cookie = sessionCookie(created);
    const denied = await request(app).post("/api/rag/ask").set("Cookie", cookie);
    expect(denied.status).toBe(403);

    const ask = await request(app)
      .post("/api/rag/ask")
      .set("Cookie", cookie)
      .set("X-CSRF-Token", created.body.csrf)
      .set("X-User-Id", "local");
    expect(ask.status).toBe(200);
    expect(ask.body.userId).toBe("sam");

    const duplicate = await request(app).post("/api/security/register").send({ userId: "sam", password: "sam-secret" });
    expect(duplicate.status).toBe(409);

    const out = await request(app)
      .post("/api/security/logout")
      .set("Cookie", cookie)
      .set("X-CSRF-Token", created.body.csrf);
    expect(out.status).toBe(200);
    const again = await request(app)
      .post("/api/rag/ask")
      .set("Cookie", cookie)
      .set("X-CSRF-Token", created.body.csrf);
    expect(again.status).toBe(401);
  });

  it("changes the password and rejects the old session", async () => {
    const app = appWith(session, accounts);
    const login = await request(app).post("/api/security/login").send({ userId: "local", password: "local" });
    expect(login.status).toBe(200);
    const cookie = sessionCookie(login);

    const changed = await request(app)
      .post("/api/security/password")
      .set("Cookie", cookie)
      .set("X-CSRF-Token", login.body.csrf)
      .send({ current: "local", next: "local-next" });
    expect(changed.status).toBe(200);

    const stale = await request(app)
      .post("/api/rag/ask")
      .set("Cookie", cookie)
      .set("X-CSRF-Token", login.body.csrf);
    expect(stale.status).toBe(401);

    const next = await request(app).post("/api/security/login").send({ userId: "local", password: "local-next" });
    expect(next.status).toBe(200);
    await accounts.changePassword({ userId: "local", current: "local-next", next: "local" });
  });

  it("stops a burst of failed logins", async () => {
    let time = 5_000;
    const failures = createFailureLimiter({ max: 2, windowMs: 60_000, now: () => time });
    const app = appWith(session, accounts, failures);
    expect((await request(app).post("/api/security/login").send({ userId: "guest", password: "nope" })).status).toBe(401);
    expect((await request(app).post("/api/security/login").send({ userId: "guest", password: "nope" })).status).toBe(401);
    const blocked = await request(app).post("/api/security/login").send({ userId: "guest", password: "guest" });
    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBe("60");
    time += 60_000;
    expect((await request(app).post("/api/security/login").send({ userId: "guest", password: "guest" })).status).toBe(200);
  });
});
