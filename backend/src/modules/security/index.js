import { config } from "../../core/config.js";

import { createAccountStore, loadAccountCollection } from "./accounts.js";
import { createRateLimiter } from "./limit.js";
import { createSecurityRouter } from "./router.js";
import { createSessionAuth } from "./session.js";

export function createSecurityModule({
  limit = config.rateLimit.max,
  windowMs = config.rateLimit.windowMs,
  now,
  session,
  accounts,
  seed,
  failures,
} = {}) {
  const limiter = createRateLimiter({ limit, windowMs, now });
  const auth = session === undefined ? null : session;
  const people = accounts ?? auth?.accounts ?? null;
  return {
    id: "security",
    name: "Security",
    router: createSecurityRouter({ limiter, session: auth, accounts: people, failures }),
    guard: limiter.guard,
    auth: auth?.guard,
    async init() {
      if (!people) return "session off";
      let store = "memory";
      try {
        const loaded = await loadAccountCollection();
        people.attach(loaded.collection);
        await people.replaceAll(loaded.rows);
        store = "mongo";
      } catch (err) {
        store = `memory (${err.message})`;
      }
      await people.seed(seed ?? config.auth.passwords);
      return store;
    },
    health() {
      return {
        limit: limiter.limit,
        windowMs: limiter.windowMs,
        session: auth ? "cookie" : "off",
        accounts: people?.persistence?.() ?? "off",
      };
    },
  };
}

export function createConfiguredSession(accounts = createAccountStore()) {
  return createSessionAuth({ accounts, passwords: config.auth.passwords });
}
