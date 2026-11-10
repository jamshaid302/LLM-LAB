import { LIMITED_ROUTES, isLimited, routeLabel } from "./routes.js";

/**
 * One fixed window per person. Local and Guest are separate.
 * Any other header shares one bucket, so a new name does not get a new budget.
 * The map lives in this process. A restart clears it.
 */
export function createRateLimiter({ limit, windowMs, now = () => Date.now(), routes = LIMITED_ROUTES } = {}) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("Rate limit must be a positive integer");
  if (!Number.isInteger(windowMs) || windowMs < 1) throw new Error("Rate limit window must be a positive integer");

  const buckets = new Map();

  function bucketKey(req) {
    if (typeof req.labUserId === "string" && req.labUserId) return req.labUserId;
    const header = req.get("X-User-Id");
    if (header === "guest") return "guest";
    if (!header || header === "local") return "local";
    return "unknown";
  }

  function guard(req, res, next) {
    if (!isLimited(req, routes)) return next();

    const time = now();
    const key = bucketKey(req);
    let bucket = buckets.get(key);
    if (!bucket || time - bucket.started >= windowMs) {
      bucket = { started: time, count: 0 };
      buckets.set(key, bucket);
    }

    if (bucket.count >= limit) {
      const retryAfter = Math.max(1, Math.ceil((bucket.started + windowMs - time) / 1000));
      res.set("Retry-After", String(retryAfter));
      res.status(429).json({ error: "Too many requests", retryAfter });
      return;
    }

    bucket.count += 1;
    next();
  }

  function policy() {
    return {
      limit,
      windowMs,
      routes: routes.map(routeLabel),
      note: "A signed-in person has their own count. Without a session, Local and Guest are separate and any other header shares one count. A restart clears the counts.",
    };
  }

  return { guard, policy, limit, windowMs };
}
