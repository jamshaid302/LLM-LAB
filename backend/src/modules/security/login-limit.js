/** Failed logins and registrations, counted by address. A success clears the count. */
export function createFailureLimiter({ max = 8, windowMs = 60_000, now = () => Date.now() } = {}) {
  const buckets = new Map();

  function bucketFor(key, time) {
    let bucket = buckets.get(key);
    if (!bucket || time - bucket.started >= windowMs) {
      bucket = { started: time, count: 0 };
      buckets.set(key, bucket);
    }
    return bucket;
  }

  return {
    max,
    windowMs,
    blocked(key) {
      const time = now();
      const bucket = buckets.get(key);
      if (!bucket || time - bucket.started >= windowMs || bucket.count < max) return null;
      return Math.max(1, Math.ceil((bucket.started + windowMs - time) / 1000));
    },
    hit(key) {
      bucketFor(key, now()).count += 1;
    },
    clear(key) {
      buckets.delete(key);
    },
  };
}

export function clientKey(req) {
  return req.ip || req.socket?.remoteAddress || "local";
}
