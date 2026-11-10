import { createHmac, randomBytes } from "node:crypto";

import { config } from "../../core/config.js";

import { createAccountStore } from "./accounts.js";

const COOKIE = "lab-session";
const CSRF_COOKIE = "lab-csrf";

export function createSessionAuth({
  accounts,
  passwords,
  secret = config.auth.secret,
  ttlMs = config.auth.ttlMs,
  now = () => Date.now(),
} = {}) {
  const store = accounts ?? createAccountStore();
  const ready = store.seed(passwords ?? {});
  const sessions = new Map();

  async function login(userId, password) {
    await ready;
    const id = typeof userId === "string" ? userId.trim().toLowerCase() : "";
    const found = await store.verify(id, password);
    if (!found) return null;
    return issue(found);
  }

  function issue(userId) {
    const sid = randomBytes(16).toString("base64url");
    const csrf = randomBytes(16).toString("base64url");
    const exp = now() + ttlMs;
    sessions.set(sid, { userId, exp, csrf });
    return { userId, csrf, cookie: tokenFor({ sid, userId, exp }, secret) };
  }

  function readRecord(cookieHeader) {
    const token = cookieValue(cookieHeader, COOKIE);
    if (!token) return null;
    const [body, sig] = token.split(".");
    if (!body || !sig || sign(body, secret) !== sig) return null;
    let payload;
    try {
      payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    } catch {
      return null;
    }
    const record = sessions.get(payload?.sid);
    if (!record || record.userId !== payload.userId || record.exp <= now()) return null;
    return record;
  }

  function read(cookieHeader) {
    return readRecord(cookieHeader)?.userId ?? null;
  }

  function revoke(cookieHeader) {
    const token = cookieValue(cookieHeader, COOKIE);
    const body = token.split(".")[0];
    if (!body) return;
    try {
      const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
      sessions.delete(payload?.sid);
    } catch {
      // A broken cookie has nothing to revoke.
    }
  }

  function revokeUser(userId) {
    for (const [sid, record] of sessions) {
      if (record.userId === userId) sessions.delete(sid);
    }
  }

  function guard(req, res, next) {
    if (isOpen(req)) return next();
    const record = readRecord(req.get("cookie"));
    if (!record) {
      res.status(401).json({ error: "Log in" });
      return;
    }
    if (!isSafe(req.method) && req.get("x-csrf-token") !== record.csrf) {
      res.status(403).json({ error: "Missing security token" });
      return;
    }
    req.labUserId = record.userId;
    req.headers["x-user-id"] = record.userId;
    next();
  }

  return {
    login,
    read,
    readRecord,
    revoke,
    revokeUser,
    guard,
    issue,
    accounts: store,
    cookieName: COOKIE,
  };
}

export function sessionCookie(token, { maxAgeSec, secure = false }) {
  return cookie(COOKIE, token, { maxAgeSec, secure, httpOnly: true });
}

export function csrfCookie(token, { maxAgeSec, secure = false }) {
  return cookie(CSRF_COOKIE, token, { maxAgeSec, secure, httpOnly: false });
}

export function clearSessionCookies() {
  return [cookie(COOKIE, "", { maxAgeSec: 0, httpOnly: true }), cookie(CSRF_COOKIE, "", { maxAgeSec: 0, httpOnly: false })];
}

export function requestIsSecure(req) {
  return Boolean(req.secure) || req.get("x-forwarded-proto") === "https";
}

function cookie(name, token, { maxAgeSec, secure = false, httpOnly }) {
  const parts = [`${name}=${token}`, "SameSite=Lax", "Path=/", `Max-Age=${maxAgeSec}`];
  if (httpOnly) parts.splice(1, 0, "HttpOnly");
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function isSafe(method) {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

function isOpen(req) {
  return (
    (req.method === "POST" && req.path === "/api/security/login") ||
    (req.method === "POST" && req.path === "/api/security/register") ||
    (req.method === "POST" && req.path === "/api/security/logout") ||
    (req.method === "GET" && req.path === "/api/security/session")
  );
}

function tokenFor(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

function sign(body, secret) {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

function cookieValue(header, name) {
  if (!header) return "";
  const found = String(header)
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : "";
}
