import { MongoClient, ObjectId } from "mongodb";

import { config } from "../../core/config.js";
import { hasOwner } from "../../utils/generals.js";

export function createMongoConversationStore(db) {
  const threads = db.collection("threads");
  const messages = db.collection("messages");

  return {
    async ensureIndexes() {
      await threads.createIndex({ userId: 1, updatedAt: -1 });
      await messages.createIndex({ threadId: 1, userId: 1, createdAt: 1 });

      const legacy = await messages.findOne(
        { userId: { $exists: false } },
        { projection: { _id: 1 } },
      );

      if (legacy) {
        const owners = await threads
          .find({}, { projection: { _id: 1, userId: 1 } })
          .toArray();
        for (const thread of owners) {
          await messages.updateMany(
            { threadId: thread._id.toString(), userId: { $exists: false } },
            { $set: { userId: thread.userId } },
          );
        }
      }
    },

    async createThread({ userId, title = "New chat" }) {
      const owner = requireOwner(userId);
      const now = new Date();
      const result = await threads.insertOne({
        userId: owner,
        title,
        summary: "",
        summarizedCount: 0,
        createdAt: now,
        updatedAt: now,
      });
      return presentThread({
        _id: result.insertedId,
        userId: owner,
        title,
        summary: "",
        summarizedCount: 0,
        createdAt: now,
        updatedAt: now,
      });
    },

    async listThreads(userId) {
      if (!hasOwner(userId)) return [];

      const docs = await threads
        .find({ userId })
        .sort({ updatedAt: -1 })
        .toArray();
      return docs.map(presentThread);
    },

    async getThread(id, userId) {
      const _id = asObjectId(id);
      if (!_id || !hasOwner(userId)) return null;
      const doc = await threads.findOne({ _id, userId });
      return doc ? presentThread(doc) : null;
    },

    async addMessage({ threadId, userId, role, content, stopped = false }) {
      if (!hasOwner(userId)) return null;

      const thread = await this.getThread(threadId, userId);
      if (!thread) return null;
      const now = new Date();
      const result = await messages.insertOne({
        threadId,
        userId,
        role,
        content,
        stopped,
        createdAt: now,
      });
      const title =
        role === "user" && thread.title === "New chat"
          ? content.slice(0, 48)
          : thread.title;
      await threads.updateOne(
        { _id: new ObjectId(threadId), userId },
        { $set: { updatedAt: now, title } },
      );
      return {
        id: result.insertedId.toString(),
        threadId,
        role,
        content,
        stopped,
        createdAt: now.toISOString(),
      };
    },

    async updateSummary(threadId, { userId, summary, summarizedCount }) {
      const _id = asObjectId(threadId);
      if (!_id || !hasOwner(userId)) return null;
      const now = new Date();
      const updated = await threads.findOneAndUpdate(
        { _id, userId },
        { $set: { summary, summarizedCount, updatedAt: now } },
        { returnDocument: "after" },
      );
      return updated ? presentThread(updated) : null;
    },

    async listMessages(threadId, userId) {
      if (typeof threadId !== "string" || !threadId || !hasOwner(userId))
        return [];

      const docs = await messages
        .find({ threadId, userId })
        .sort({ createdAt: 1, _id: 1 })
        .toArray();
      return docs.map((doc) => ({
        id: doc._id.toString(),
        threadId: doc.threadId,
        role: doc.role,
        content: doc.content,
        stopped: Boolean(doc.stopped),
        createdAt: doc.createdAt.toISOString(),
      }));
    },
  };
}

export async function connectMongo({ url = config.mongo.url } = {}) {
  const client = new MongoClient(url);
  await client.connect();
  const dbName = new URL(url).pathname.replace(/^\//, "") || "lab";
  const store = createMongoConversationStore(client.db(dbName));
  await store.ensureIndexes();
  return store;
}

function requireOwner(userId) {
  if (!hasOwner(userId))
    throw new Error("Conversation store requires a non-empty userId");
  return userId;
}

function asObjectId(id) {
  if (typeof id !== "string" || !ObjectId.isValid(id)) return null;
  return new ObjectId(id);
}

function presentThread(doc) {
  return {
    id: doc._id.toString(),
    userId: doc.userId,
    title: doc.title,
    summary: doc.summary ?? "",
    summarizedCount: doc.summarizedCount ?? 0,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
