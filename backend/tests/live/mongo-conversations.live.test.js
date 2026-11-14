import { ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMongoConversationStore } from "../../src/modules/conversations/mongo-store.js";

import { openLiveDb } from "./helpers.js";

const dbName = "lab_live_conversations";
let live;
let store;

beforeAll(async () => {
  live = await openLiveDb(dbName);
  await live.db.dropDatabase();
  store = createMongoConversationStore(live.db);
  await store.ensureIndexes();
});

afterAll(async () => {
  await live?.db.dropDatabase();
  await live?.client.close();
});

describe("conversations in the running Mongo", () => {
  it("scopes threads, messages, and rolling summaries to the owning userId", async () => {
    const guestThread = await store.createThread({ userId: "guest" });
    const localThread = await store.createThread({ userId: "local" });

    await store.addMessage({ threadId: guestThread.id, userId: "guest", role: "user", content: "Guest secret 42" });
    await store.updateSummary(guestThread.id, { userId: "guest", summary: "Guest summary", summarizedCount: 1 });

    expect((await store.listThreads("local")).map((t) => t.id)).toEqual([localThread.id]);
    expect((await store.listThreads("guest")).map((t) => t.id)).toEqual([guestThread.id]);

    expect(await store.getThread(guestThread.id, "local")).toBeNull();
    expect(await store.getThread(guestThread.id)).toBeNull();
    expect(await store.getThread(guestThread.id, { $ne: "" })).toBeNull();
    expect(await store.listMessages(guestThread.id, "local")).toEqual([]);
    expect(await store.listMessages(guestThread.id)).toEqual([]);
    expect(await store.addMessage({ threadId: guestThread.id, userId: "local", role: "user", content: "hijack" })).toBeNull();
    expect(
      await store.updateSummary(guestThread.id, { userId: "local", summary: "hijack", summarizedCount: 2 }),
    ).toBeNull();

    const storedMessages = await live.db.collection("messages").find({ threadId: guestThread.id }).toArray();
    expect(storedMessages).toHaveLength(1);
    expect(storedMessages[0].userId).toBe("guest");

    const ownerThread = await store.getThread(guestThread.id, "guest");
    expect(ownerThread.summary).toBe("Guest summary");
    expect((await store.listMessages(guestThread.id, "guest")).map((m) => m.content)).toEqual(["Guest secret 42"]);
  });

  it("backfills userId onto legacy messages without userId during ensureIndexes", async () => {
    const legacyThread = await store.createThread({ userId: "guest" });
    const now = new Date();
    await live.db.collection("messages").insertOne({
      _id: new ObjectId(),
      threadId: legacyThread.id,
      role: "user",
      content: "Legacy message before userId field",
      stopped: false,
      createdAt: now,
    });

    await store.ensureIndexes();

    expect((await store.listMessages(legacyThread.id, "guest")).map((m) => m.content)).toEqual([
      "Legacy message before userId field",
    ]);
    expect(await store.listMessages(legacyThread.id, "local")).toEqual([]);
  });
});
