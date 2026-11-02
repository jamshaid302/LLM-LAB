import { MongoClient, ObjectId } from "mongodb";

import { config } from "../../core/config.js";

export function createMongoConversationStore(db) {
  const threads = db.collection("threads");
  const messages = db.collection("messages");

  return {
    async ensureIndexes() {
      await threads.createIndex({ userId: 1, updatedAt: -1 });
      await messages.createIndex({ threadId: 1, createdAt: 1 });
    },

    async createThread({ userId, title = "New chat" }) {
      const now = new Date();
      const result = await threads.insertOne({
        userId,
        title,
        summary: "",
        summarizedCount: 0,
        createdAt: now,
        updatedAt: now,
      });
      return presentThread({
        _id: result.insertedId,
        userId,
        title,
        summary: "",
        summarizedCount: 0,
        createdAt: now,
        updatedAt: now,
      });
    },

    async listThreads(userId) {
      const docs = await threads.find({ userId }).sort({ updatedAt: -1 }).toArray();
      return docs.map(presentThread);
    },

    async getThread(id) {
      const _id = asObjectId(id);
      if (!_id) return null;
      const doc = await threads.findOne({ _id });
      return doc ? presentThread(doc) : null;
    },

    async addMessage({ threadId, role, content, stopped = false }) {
      const thread = await this.getThread(threadId);
      if (!thread) return null;
      const now = new Date();
      const result = await messages.insertOne({
        threadId,
        role,
        content,
        stopped,
        createdAt: now,
      });
      const title = role === "user" && thread.title === "New chat" ? content.slice(0, 48) : thread.title;
      await threads.updateOne({ _id: new ObjectId(threadId) }, { $set: { updatedAt: now, title } });
      return {
        id: result.insertedId.toString(),
        threadId,
        role,
        content,
        stopped,
        createdAt: now.toISOString(),
      };
    },

    async updateSummary(threadId, { summary, summarizedCount }) {
      const _id = asObjectId(threadId);
      if (!_id) return null;
      const now = new Date();
      const updated = await threads.findOneAndUpdate(
        { _id },
        { $set: { summary, summarizedCount, updatedAt: now } },
        { returnDocument: "after" },
      );
      return updated ? presentThread(updated) : null;
    },

    async listMessages(threadId) {
      const docs = await messages.find({ threadId }).sort({ createdAt: 1, _id: 1 }).toArray();
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
