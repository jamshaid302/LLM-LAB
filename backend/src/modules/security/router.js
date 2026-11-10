import { Router } from "express";

import { asyncHandler } from "../../core/http.js";
import { config } from "../../core/config.js";

import { clientKey, createFailureLimiter } from "./login-limit.js";
import {
  clearSessionCookies,
  csrfCookie,
  requestIsSecure,
  sessionCookie,
} from "./session.js";

export function createSecurityRouter({ limiter, session, accounts, failures }) {
  const router = Router();
  const loginFailures =
    failures ??
    createFailureLimiter({ max: config.auth.loginMax, windowMs: config.auth.loginWindowMs });

  router.get("/", (req, res) => {
    res.json({
      ...limiter.policy(),
      session: session ? "cookie" : "off",
      loginMax: loginFailures.max,
      loginWindowMs: loginFailures.windowMs,
    });
  });

  router.get("/session", (req, res) => {
    const record = session?.readRecord?.(req.get("cookie")) ?? null;
    const userId = record?.userId ?? session?.read(req.get("cookie")) ?? null;
    if (!userId) {
      res.status(401).json({ error: "Log in" });
      return;
    }
    res.json({ userId, csrf: record?.csrf ?? null });
  });

  router.post(
    "/register",
    asyncHandler(async (req, res) => {
      if (!accounts || !session) {
        res.status(404).json({ error: "Login is not configured" });
        return;
      }
      if (refuseBurst(loginFailures, req, res)) return;
      const created = await accounts.register({
        userId: req.body?.userId,
        password: req.body?.password,
      });
      if (created.error) {
        loginFailures.hit(clientKey(req));
        const status = created.error.includes("already") ? 409 : 400;
        res.status(status).json({ error: created.error });
        return;
      }
      loginFailures.clear(clientKey(req));
      const result = await session.login(created.userId, req.body.password);
      sendSession(res, req, result);
    }),
  );

  router.post(
    "/login",
    asyncHandler(async (req, res) => {
      if (!session) {
        res.status(404).json({ error: "Login is not configured" });
        return;
      }
      if (refuseBurst(loginFailures, req, res)) return;
      const userId = typeof req.body?.userId === "string" ? req.body.userId : "";
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      const result = await session.login(userId, password);
      if (!result) {
        loginFailures.hit(clientKey(req));
        res.status(401).json({ error: "Unknown person or password" });
        return;
      }
      loginFailures.clear(clientKey(req));
      sendSession(res, req, result);
    }),
  );

  router.post("/logout", (req, res) => {
    const record = session?.readRecord?.(req.get("cookie")) ?? null;
    if (record && req.get("x-csrf-token") !== record.csrf) {
      res.status(403).json({ error: "Missing security token" });
      return;
    }
    session?.revoke?.(req.get("cookie"));
    res.set("Set-Cookie", clearSessionCookies());
    res.json({ userId: null });
  });

  router.post(
    "/password",
    asyncHandler(async (req, res) => {
      if (!accounts || !session) {
        res.status(404).json({ error: "Login is not configured" });
        return;
      }
      const userId = req.labUserId;
      const changed = await accounts.changePassword({
        userId,
        current: req.body?.current,
        next: req.body?.next,
      });
      if (changed.error) {
        const status = changed.error === "Current password is wrong" ? 401 : 400;
        res.status(status).json({ error: changed.error });
        return;
      }
      session.revokeUser(userId);
      res.set("Set-Cookie", clearSessionCookies());
      res.json({ userId: null });
    }),
  );

  return router;
}

function refuseBurst(failures, req, res) {
  const retryAfter = failures.blocked(clientKey(req));
  if (!retryAfter) return false;
  res.set("Retry-After", String(retryAfter));
  res.status(429).json({ error: "Too many attempts", retryAfter });
  return true;
}

function sendSession(res, req, result) {
  const maxAgeSec = Math.floor(config.auth.ttlMs / 1000);
  const secure = requestIsSecure(req);
  res.set("Set-Cookie", [
    sessionCookie(result.cookie, { maxAgeSec, secure }),
    csrfCookie(result.csrf, { maxAgeSec, secure }),
  ]);
  res.json({ userId: result.userId, csrf: result.csrf });
}
