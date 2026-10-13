# Local RAG Chatbot — React + Express + LangChain.js + Ollama

A free, fully local RAG (Retrieval-Augmented Generation) chatbot:
- **Frontend:** React (Vite)
- **Backend:** Express.js + LangChain.js
- **LLM + Embeddings:** Ollama, running locally
- **Vector store:** in-memory (via LangChain's `MemoryVectorStore`) — a real vector
  database in every functional sense (embeddings + cosine similarity search), it just
  doesn't run as a separate server process. Swappable for Chroma/Pinecone later with
  ~2 line changes.

No paid API keys. No cloud database. Everything runs on your machine.

## Why Express instead of NestJS here

NestJS is a great framework, but it adds structure (modules, decorators, DI) that's
extra ceremony for a first RAG project — you'd spend more time wiring Nest's
boilerplate than learning RAG itself. This project uses plain Express to keep the
LangChain.js pipeline (the part you're actually here to learn) front and center in one
readable file. Once RAG makes sense, wrapping this same logic in a NestJS service/module
is a very mechanical refactor — happy to help with that version once you're comfortable here.

## Why MemoryVectorStore instead of FAISS

`faiss-node` requires compiling native C++ bindings, which fails silently on some
machines (missing build tools, Node version mismatches, Apple Silicon quirks) — exactly
the kind of setup pain that kills momentum on a learning project. `MemoryVectorStore`
does the same embedding + cosine similarity search with zero native dependencies and
zero install risk. For a portfolio piece later, upgrading to Chroma (still free, runs
as a local Docker container) is one dependency swap — the retrieval code doesn't change.

## Answering your "won't this eat my laptop's memory" concern

Short version: **no, if you pick the right model size.**

- The embedding model (`nomic-embed-text`, ~270MB) is tiny and runs on basically anything.
- The chat model is the one that matters. This project defaults to `llama3.2:1b`
  (~1.3GB on disk, roughly 4-6GB RAM while running) — comfortable on most modern
  laptops, including ones without a dedicated GPU (Ollama runs fine on CPU, just slower).
- If your laptop has ≤8GB RAM total, drop to `qwen2.5:0.5b` (~400MB) — noticeably lower
  quality answers, but perfectly fine for learning the RAG *mechanics*, which is the
  actual goal right now.
- Ollama only loads the model into memory while it's actively being used for your
  requests — it's not permanently consuming RAM in the background once idle (it unloads
  after a few minutes of inactivity by default).
- You are **not** downloading/running anything close to ChatGPT-scale models — these are
  1-3 billion parameter models, roughly 50-100x smaller than frontier hosted models.

If it still feels sluggish, that's a sign to size down the model, not a sign this
approach is broken.

## Prerequisites

- **Node.js** v18+
- **Ollama** — https://ollama.com/download

## Setup Steps

### 1. Pull the models

```bash
ollama pull nomic-embed-text
ollama pull llama3.2:1b
```

Low RAM machine? Also grab the smaller fallback and edit `CHAT_MODEL` in `backend/server.js`:
```bash
ollama pull qwen2.5:0.5b
```

### 2. Confirm Ollama is running

```bash
curl http://localhost:11434
```
Should respond (not connection-refused). If needed: `ollama serve`.

### 3. Install and start the backend

```bash
cd mern-rag-chatbot/backend
npm install
npm run dev
```

You should see:
```
🚀 RAG backend running on http://localhost:5000
Splitting knowledge.txt into N chunks...
Vector store ready with N embedded chunks.
```

### 4. Install and start the frontend (in a new terminal)

```bash
cd mern-rag-chatbot/frontend
npm install
npm run dev
```

Open **http://localhost:5173** — the Vite dev server proxies `/api/*` calls to your
Express backend on port 5000 (see `vite.config.js`), so you don't need to configure CORS
URLs manually in the React code.

### 5. Chat

Try:
- "What is RAG?"
- "What's the server room access code?"
- "When are pets allowed in the office?"

Each answer shows which chunks it retrieved and their similarity scores — that's the
part worth paying attention to, since tuning retrieval quality is most of what "doing RAG well" means in practice.

## Project structure

```
mern-rag-chatbot/
├── backend/
│   ├── docs/knowledge.txt      <- swap this with your own content
│   ├── server.js                <- the entire RAG pipeline, one file
│   └── package.json
└── frontend/
    ├── src/
    │   ├── App.jsx               <- chat UI
    │   ├── main.jsx
    │   └── index.css
    ├── index.html
    ├── vite.config.js
    └── package.json
```

## Things to try next

1. **Swap `backend/docs/knowledge.txt`** with your resume, a project README, or class
   notes, then hit the "Re-ingest docs" button in the UI.
2. **Change `chunkSize`/`chunkOverlap`** in `server.js`'s `RecursiveCharacterTextSplitter`
   and see how retrieval quality changes.
3. **Change `TOP_K`** from 3 to 1 and watch answers get worse — this is the core
   retrieval-quantity tradeoff every real RAG system tunes.
4. **Swap in Chroma**: `docker run -p 8000:8000 chromadb/chroma`, then replace
   `MemoryVectorStore` with LangChain's `Chroma` vector store class — same
   `similaritySearchWithScore` API, almost no other code changes.
5. **Swap the LLM for a hosted one** (Claude/OpenAI) once you're ready to build your
   polished portfolio piece — only the `llm` initialization changes; the retrieval and
   prompt-building logic stays identical. This is the actual point of using LangChain.js:
   the abstraction lets you swap providers without rewriting your pipeline.
6. **Add file upload** in the UI so users can upload their own `.txt`/`.pdf` instead of
   editing `knowledge.txt` by hand — natural next step once this feels familiar.

## Troubleshooting

- **Backend fails to ingest on startup** → Ollama isn't running or models aren't pulled. Check step 1-2.
- **Requests are slow** → normal for CPU-only inference, especially on first request per session (model load time). Try the smaller model if it's consistently too slow.
- **CORS errors** → shouldn't happen given the Vite proxy, but if you change ports, update `vite.config.js` accordingly.
- **Port conflicts** → change `PORT` in `backend/server.js` or `server.port` in `frontend/vite.config.js`.
