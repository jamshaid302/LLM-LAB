import { MongoClient } from "mongodb";

import { config } from "../../src/core/config.js";

/** Same server as the lab, different database, so a test can drop it safely. */
export function liveMongoUrl(name = "lab_live_test") {
  const url = new URL(config.mongo.url);
  url.pathname = `/${name}`;
  return url.toString();
}

export async function openLiveDb(name) {
  const url = liveMongoUrl(name);
  const client = new MongoClient(url, { serverSelectionTimeoutMS: 3000 });
  await client.connect();
  return { url, client, db: client.db() };
}

/** Three-number vectors by keyword, so Chroma tests do not need Ollama. */
export function keywordEmbeddings() {
  const vector = (text) => {
    const value = String(text).toLowerCase();
    return [value.includes("gym") ? 1 : 0.01, value.includes("maple") ? 1 : 0.01, value.includes("birch") ? 1 : 0.01];
  };
  return {
    embedDocuments: async (texts) => texts.map(vector),
    embedQuery: async (text) => vector(text),
  };
}
