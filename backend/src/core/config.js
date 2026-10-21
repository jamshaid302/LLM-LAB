import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Backend folder: where this app's package.json and .env live. */
export const backendRoot = path.resolve(here, "..", "..");

dotenv.config({ path: path.join(backendRoot, ".env"), quiet: true });

function readInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;

  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Env var ${name} must be an integer, got "${raw}"`);
  }
  return parsed;
}

function readString(name, fallback) {
  const raw = process.env[name];
  return raw === undefined || raw === "" ? fallback : raw;
}

export const config = {
  ollama: {
    baseUrl: readString("OLLAMA_BASE_URL", "http://localhost:11434"),
    chatModel: readString("CHAT_MODEL", "qwen2.5:7b"),
    embedModel: readString("EMBED_MODEL", "nomic-embed-text"),
  },
  rag: {
    topK: readInt("RAG_TOP_K", 3),
    chunkSize: readInt("RAG_CHUNK_SIZE", 400),
    chunkOverlap: readInt("RAG_CHUNK_OVERLAP", 50),
  },
  ports: {
    api: readInt("API_PORT", 5000),
  },
};

export { readInt, readString };
