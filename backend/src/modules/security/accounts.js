import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import { MongoClient } from "mongodb";

import { config } from "../../core/config.js";
import { isAccountId } from "../../core/users.js";

const scryptAsync = promisify(scrypt);
const dummyHash = hashPassword("lab-dummy-password");

export function validPassword(password) {
  return typeof password === "string" && password.length >= 4 && password.length <= 72;
}

export function createAccountStore() {
  const users = new Map();
  let collection = null;

  async function persist(id, hash) {
    if (!collection) return;
    await collection.updateOne({ _id: id }, { $set: { hash } }, { upsert: true });
  }

  return {
    attach(next) {
      collection = next;
    },
    persistence() {
      return collection ? "mongo" : "memory";
    },
    async replaceAll(rows) {
      users.clear();
      for (const row of rows) {
        if (isAccountId(row._id) && typeof row.hash === "string") users.set(row._id, row.hash);
      }
    },
    async seed(passwords) {
      for (const [id, password] of Object.entries(passwords ?? {})) {
        if (!isAccountId(id) || users.has(id) || !validPassword(password)) continue;
        const hash = await hashPassword(password);
        users.set(id, hash);
        await persist(id, hash);
      }
    },
    has(userId) {
      return users.has(userId);
    },
    async verify(userId, password) {
      const hash = users.get(userId);
      const ok = await verifyPassword(password, hash ?? (await dummyHash));
      if (!hash || !ok) return null;
      return userId;
    },
    async register({ userId, password }) {
      const id = typeof userId === "string" ? userId.trim().toLowerCase() : "";
      if (!isAccountId(id)) {
        return { error: "Use 3 to 20 lowercase letters and numbers, starting with a letter" };
      }
      if (!validPassword(password)) return { error: "Password must be 4 to 72 characters" };
      if (users.has(id)) return { error: "That person already has an account" };
      const hash = await hashPassword(password);
      users.set(id, hash);
      await persist(id, hash);
      return { userId: id };
    },
    async changePassword({ userId, current, next }) {
      if (!validPassword(next)) return { error: "Password must be 4 to 72 characters" };
      const ok = await this.verify(userId, current);
      if (!ok) return { error: "Current password is wrong" };
      const hash = await hashPassword(next);
      users.set(userId, hash);
      await persist(userId, hash);
      return { userId };
    },
  };
}

export async function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = (await scryptAsync(password, salt, 32)).toString("hex");
  return `${salt}:${hash}`;
}

export async function verifyPassword(password, stored) {
  const [salt, hash] = String(stored ?? "").split(":");
  if (!salt || !hash) return false;
  const next = (await scryptAsync(password, salt, 32)).toString("hex");
  const left = Buffer.from(hash, "hex");
  const right = Buffer.from(next, "hex");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function loadAccountCollection(url = config.mongo.url) {
  const client = new MongoClient(url, { serverSelectionTimeoutMS: 2000 });
  await client.connect();
  const collection = client.db().collection("accounts");
  const rows = await collection.find({}).toArray();
  return { collection, rows };
}
