// server.js
// React + Express + LangChain.js + Ollama local RAG backend.
// No paid API, no external DB server — vector store lives in memory.

import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { Ollama, OllamaEmbeddings } from "@langchain/ollama";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- Config (tweak these based on your machine's RAM — see README) ----
const OLLAMA_BASE_URL = "http://localhost:11434";
const CHAT_MODEL = "llama3.2:1b";        // swap to "qwen2.5:0.5b" if your laptop is low on RAM
const EMBED_MODEL = "nomic-embed-text";  // small, keep as-is
const TOP_K = 3;                          // how many chunks to retrieve per question

const app = express();
app.use(cors());
app.use(express.json());

// ---- LangChain.js setup ----

const llm = new Ollama({
  baseUrl: OLLAMA_BASE_URL,
  model: CHAT_MODEL,
  temperature: 0,
});

const embeddings = new OllamaEmbeddings({
  baseUrl: OLLAMA_BASE_URL,
  model: EMBED_MODEL,
});

// This is a real vector store (cosine similarity search under the hood) —
// it just happens to live in memory instead of a separate DB process.
// Swapping this line for Chroma/Pinecone later doesn't change anything else below.
let vectorStore = new MemoryVectorStore(embeddings);

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 400,
  chunkOverlap: 50,
});

// ---- Ingestion ----
async function ingestDocs() {
  const filePath = path.join(__dirname, "docs", "knowledge.txt");
  const raw = fs.readFileSync(filePath, "utf-8");

  const chunks = await splitter.createDocuments([raw]);
  console.log(`Splitting knowledge.txt into ${chunks.length} chunks...`);

  // Reset the store so re-ingesting doesn't duplicate entries
  vectorStore = new MemoryVectorStore(embeddings);
  await vectorStore.addDocuments(chunks);

  console.log(`Vector store ready with ${chunks.length} embedded chunks.`);
  return chunks.length;
}

// ---- Routes ----

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", chatModel: CHAT_MODEL, embedModel: EMBED_MODEL });
});

app.post("/api/reingest", async (req, res) => {
  try {
    const count = await ingestDocs();
    res.json({ status: "ok", chunks: count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/ask", async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) {
      return res.status(400).json({ error: "Missing 'question' in request body" });
    }

    // A. Embed the question + run similarity search against the vector store
    const results = await vectorStore.similaritySearchWithScore(question, TOP_K);

    // B. Extract text + build context block
    const contextText = results
      .map(([doc], i) => `[${i + 1}] ${doc.pageContent}`)
      .join("\n\n");

    // C. Build the RAG prompt
    const ragPrompt = `You are a helpful assistant. Answer the question using ONLY the context below.
If the answer isn't in the context, say "I don't know based on the provided documents."
Cite source numbers like [1] or [2] in your answer.

Context:
${contextText}

Question: ${question}

Answer:`;

    // D. Generate the answer with the local LLM
    const answer = await llm.invoke(ragPrompt);

    res.json({
      answer,
      matchedSources: results.map(([doc, score]) => ({
        text: doc.pageContent,
        score: score.toFixed(3),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = 5000;
app.listen(PORT, async () => {
  console.log(`🚀 RAG backend running on http://localhost:${PORT}`);
  try {
    await ingestDocs();
  } catch (err) {
    console.error("❌ Failed to ingest docs on startup:", err.message);
    console.error("   Make sure Ollama is running and models are pulled (see README).");
  }
});
