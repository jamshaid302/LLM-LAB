import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAccountStore, loadAccountCollection } from "../../src/modules/security/accounts.js";

import { liveMongoUrl, openLiveDb } from "./helpers.js";

const dbName = "lab_live_accounts";
let live;

beforeAll(async () => {
  live = await openLiveDb(dbName);
  await live.db.dropDatabase();
});

afterAll(async () => {
  await live?.db.dropDatabase();
  await live?.client.close();
});

/** A fresh store that loads from Mongo, the way security init does after a restart. */
async function restartedStore() {
  const loaded = await loadAccountCollection(liveMongoUrl(dbName));
  const store = createAccountStore();
  store.attach(loaded.collection);
  await store.replaceAll(loaded.rows);
  return store;
}

describe("accounts in the running Mongo", () => {
  it("keeps a registered account after a restart, with a salted hash and no plain password", async () => {
    const first = await restartedStore();
    expect(first.persistence()).toBe("mongo");
    expect(await first.register({ userId: "livetest", password: "first-pass" })).toEqual({ userId: "livetest" });

    const saved = await live.db.collection("accounts").findOne({ _id: "livetest" });
    expect(saved.hash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{64}$/);
    expect(JSON.stringify(saved)).not.toContain("first-pass");

    const second = await restartedStore();
    expect(await second.verify("livetest", "first-pass")).toBe("livetest");
    expect(await second.verify("livetest", "wrong-pass")).toBeNull();
  });

  it("keeps a password change after a restart", async () => {
    const store = await restartedStore();
    expect(await store.changePassword({ userId: "livetest", current: "first-pass", next: "second-pass" })).toEqual({
      userId: "livetest",
    });
    const after = await restartedStore();
    expect(await after.verify("livetest", "second-pass")).toBe("livetest");
    expect(await after.verify("livetest", "first-pass")).toBeNull();
  });

  it("seeds Local and Guest once and does not overwrite a changed password", async () => {
    const store = await restartedStore();
    await store.seed({ local: "local", guest: "guest" });
    await store.changePassword({ userId: "local", current: "local", next: "changed-local" });

    const after = await restartedStore();
    await after.seed({ local: "local", guest: "guest" });
    expect(await after.verify("local", "changed-local")).toBe("local");
    expect(await after.verify("guest", "guest")).toBe("guest");
  });
});
