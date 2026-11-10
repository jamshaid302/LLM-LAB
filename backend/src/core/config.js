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

function readNumber(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Env var ${name} must be a number, got "${raw}"`);
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
    // Tool calling is a separate model. A 1b chat model is a weak tool caller.
    agentModel: readString("AGENT_MODEL", "qwen2.5:7b"),
    embedModel: readString("EMBED_MODEL", "nomic-embed-text"),
    // One chat call. A 7b reply on this machine is well under this.
    timeoutMs: readInt("OLLAMA_TIMEOUT_MS", 120_000),
  },
  rag: {
    topK: readInt("RAG_TOP_K", 3),
    minScore: readNumber("RAG_MIN_SCORE", 0.5),
    chunkSize: readInt("RAG_CHUNK_SIZE", 400),
    chunkOverlap: readInt("RAG_CHUNK_OVERLAP", 50),
    // memory keeps the original in-process store. chroma persists across restarts.
    store: readString("RAG_STORE", "memory"),
    chromaUrl: readString("CHROMA_URL", "http://localhost:8000"),
  },
  rerank: {
    // cross-encoder rescores a wider candidate list, then keeps top K. off keeps vector order.
    // It is the default because it raised recall and MRR on eval/questions.json (see baseline.json).
    mode: readString("RAG_RERANK", "cross-encoder"),
    model: readString("RERANK_MODEL", "Xenova/ms-marco-MiniLM-L-6-v2"),
    candidates: readInt("RERANK_CANDIDATES", 20),
    cacheDir: readString("RERANK_CACHE_DIR", ""),
  },
  mongo: {
    url: readString("MONGO_URL", "mongodb://127.0.0.1:27018/lab"),
  },
  conversations: {
    // How many saved messages are copied into the next prompt.
    historyLimit: readInt("CONVERSATION_HISTORY_LIMIT", 12),
    userId: "local",
  },
  ports: {
    api: readInt("API_PORT", 5001),
  },
  rateLimit: {
    max: readInt("RATE_LIMIT_MAX", 20),
    windowMs: readInt("RATE_LIMIT_WINDOW_MS", 60_000),
  },
  auth: {
    secret: readString("LAB_SESSION_SECRET", "lab-dev-session"),
    ttlMs: readInt("LAB_SESSION_TTL_MS", 12 * 60 * 60 * 1000),
    passwords: {
      local: readString("LAB_LOCAL_PASSWORD", "local"),
      guest: readString("LAB_GUEST_PASSWORD", "guest"),
    },
    loginMax: readInt("LAB_LOGIN_MAX", 8),
    loginWindowMs: readInt("LAB_LOGIN_WINDOW_MS", 60_000),
  },
  embed: {
    // inprocess embeds in the API. external leaves jobs for `npm run worker`.
    worker: readString("EMBED_WORKER", "inprocess"),
  },
};

export { readInt, readNumber, readString };
