# AI Engineering Lab

One AI platform for learning AI engineering end to end: a single React frontend and a
single Express backend, with each technique (RAG, evaluation, agents, and more) built
as a module you pick from the sidebar.

Everything runs locally against [Ollama](https://ollama.com) by default. No paid API
keys are required.

## How the platform is organized

```
ai-engineering-lab/
├─ README.md                 this file
├─ .gitignore
├─ backend/                  Express API on :5000, with its own dependencies
│  ├─ package.json
│  ├─ .env                   local config (gitignored); copy from .env.example
│  ├─ src/
│  │  ├─ main.js             starts the server, initializes modules
│  │  ├─ app.js              mounts every module at /api/<id>
│  │  ├─ core/               shared by all modules: config, model clients, HTTP helpers
│  │  └─ modules/
│  │     ├─ index.js         backend module registry
│  │     ├─ fundamentals/    one folder per module: logic, router, README
│  │     └─ rag/
│  └─ tests/
└─ frontend/                 React app on :5173, with its own dependencies
   ├─ package.json
   ├─ .env                   optional; copy from .env.example if the API port changes
   └─ src/
      ├─ App.jsx             shell: sidebar, header, active module
      ├─ components/         shared UI
      └─ modules/
         ├─ registry.js      frontend module registry
         ├─ fundamentals/    one folder per module page
         └─ rag/
```

Selecting a module in the sidebar loads that module's page, and the page talks only to
its own backend routes under `/api/<module-id>`. Pages are lazy-loaded, so a module's
code is only downloaded when you open it.

The rule that keeps this maintainable: **modules use `core/`, never each other.**
Shared infrastructure (config, model providers, logging, evaluation utilities) goes in
`core/` once two modules need it. Each module's actual technique (its prompts, retrieval
strategy, agent loop) stays inside its own folder so it can be read on its own.

### Modules

Each built module has its own README covering what it teaches, how it works, how it was
implemented, its API, and a test plan with automated and manual checks. This file only
summarizes them.

| Module                  | Status          | What it teaches                                                                      | Docs                                                 |
| ----------------------- | --------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| LLM Fundamentals        | **in progress** | Tokens, temperature, top-p, seed, and why the same prompt gives different answers    | [README](backend/src/modules/fundamentals/README.md) |
| Providers & Cost        | planned         | Local and hosted models behind one interface, fallbacks, caching, token cost         | —                                                    |
| RAG                     | **ready**       | Chunking, embeddings, similarity search, and grounding answers in your own documents | [README](backend/src/modules/rag/README.md)          |
| Advanced RAG            | planned         | Hybrid search, reranking, and query rewriting, measured against basic RAG            | —                                                    |
| Semantic Search         | planned         | Embeddings outside chat: search, deduplication, clustering, recommendations          | —                                                    |
| Document Pipeline       | planned         | PDF and Markdown upload, parsing, and embedding as background jobs                   | —                                                    |
| Streaming Chat          | planned         | Token-by-token answers over Server-Sent Events, with cancellation                    | —                                                    |
| Conversations           | planned         | Threads and messages in MongoDB, summarizing long history                            | —                                                    |
| LLM Evaluation          | planned         | Golden datasets, retrieval metrics, and LLM-as-judge scoring                         | —                                                    |
| Hallucination Detection | planned         | Checking that answers and citations are supported by the sources                     | —                                                    |
| AI Agents               | planned         | Tool calling, a bounded reasoning loop, and agent evaluation                         | —                                                    |
| Multi-Agent Systems     | planned         | Agents handing work to each other, and when that is overhead                         | —                                                    |
| Security                | planned         | Prompt injection, PII, output sanitization, per-user data isolation                  | —                                                    |
| Observability           | planned         | Tracing requests with latency and token cost                                         | —                                                    |
| Deployment              | planned         | Docker, CI, rate limiting, graceful degradation                                      | —                                                    |
| Multimodal AI           | planned         | Local vision and audio models, quantization trade-offs                               | —                                                    |
| Fine-Tuning             | planned         | SFT, LoRA, and QLoRA on a GPU worker, compared with the base model                   | —                                                    |

Planned modules appear in the sidebar with a "soon" badge and get a README when they are
built. The [roadmap](#roadmap) below is the build order.

**Fine-tuning is the one exception to "everything in one backend."** Training needs a
CUDA GPU and runs for minutes to hours, so it will run as a separate Python job (on
Colab or Kaggle, since this machine has no CUDA GPU). The Fine-Tuning page in the UI
will manage datasets and compare tuned models, but the training itself happens outside
the Express process.

## Prerequisites

- **Node.js 20+**
- **Ollama** — https://ollama.com/download
- **Docker Desktop** — not needed yet; first used for a persistent vector store
- **MongoDB** — not needed yet; first used for stored conversations
- **Python 3.11+** — not needed yet; first used for fine-tuning

## Setup

```bash
ollama pull qwen2.5:7b
ollama pull nomic-embed-text

cd backend
npm install
cp .env.example .env   # optional: every setting has a working default

cd ../frontend
npm install
```

## Running

Two terminals:

```bash
cd backend && npm run dev     # http://localhost:5000
cd frontend && npm run dev    # http://localhost:5173
```

Open http://localhost:5173. The Vite dev server proxies `/api/*` to the backend.

## Tests

```bash
cd backend
npm test
```

Tests use fake model clients wherever possible, so the suite runs in a few seconds and
does not need Ollama running.

## Adding a module

1. Create `backend/src/modules/<id>/` with an `index.js` that returns
   `{ id, name, router, init?, health? }`, and register it in `backend/src/modules/index.js`.
2. Create `frontend/src/modules/<id>/<Name>Page.jsx`, then set the module's `status` to
   `"ready"` and add `Page: lazy(() => import(...))` in `frontend/src/modules/registry.js`.
3. Add tests under `backend/tests/modules/<id>/`.
4. Add `backend/src/modules/<id>/README.md` with these sections, in this order:
   **What this module is about**, **How it works**, **How we implemented it** (backend
   and frontend files), **API**, **Test plan** (automated tests by file, then manual
   steps with expected results), **Known limitations**, and **Experiments**. Then link
   it from the modules table above.

## Hardware notes

A 1B model is fast but hallucinates often, which makes evaluation work frustrating.
`qwen2.5:7b` is the default because it grounds answers far more reliably and still runs
on CPU with enough RAM. Set `CHAT_MODEL=llama3.2:1b` in `backend/.env` if you need speed.

## Roadmap

Every milestone adds to the same platform: one backend, one frontend, one module per
technique. Milestones are deliberately small. Each one ends with tests run,
documentation updated, and a short note on what it taught.

Status: **done** · **in progress** · **planned**

### Milestone 1 — Foundation · done

Make the repository safe to change. No RAG behavior was modified.

- Initialized git and committed the original app as a baseline before anything moved.
- Flattened the duplicated folder nesting.
- Moved hardcoded ports and model names into environment-driven config.
- Split the single 160-line `server.js` into `chunking`, `prompt`, `rag-service`, and a
  router, with dependencies injected so tests can run without Ollama.
- Added Vitest and the first test suite.
- Raised the default chat model from `llama3.2:1b` to `qwen2.5:7b`.

**Why this came first:** the project had no version control and no tests. Every later
milestone is a refactor, and refactoring without either is guesswork.

### Milestone 1.5 — Platform shell · done

Turned the single chatbot into a platform that hosts every future technique as a module.

- One Express backend that mounts each module's router at `/api/<id>`, with
  `/api/modules` and per-module health in `/api/health`.
- A module contract, `{ id, name, router, init?, health? }`, and a registry in
  `backend/src/modules/index.js`.
- Shared infrastructure in `backend/src/core/`: config, Ollama clients, async route
  handling, and a central JSON error handler.
- Module initialization is isolated: one module failing at startup logs an error and
  leaves the others running.
- One React frontend with a grouped sidebar, hash routing, a backend health badge, and
  lazy-loaded module pages. Planned modules appear with a "soon" badge.
- The RAG chatbot became the first module: routes moved from `/api/ask` to `/api/rag/ask`.

**Trade-off:** a single backend process means one module can slow down or crash the
others. Startup isolation and central error handling contain the common cases.
Long-running work (fine-tuning, large ingestion jobs) will run as background jobs or a
separate worker rather than inside request handlers.

The order below is deliberate. It front-loads the work that turns an AI demo into a
product — persistence, streaming, cost, security — because that is the part most often
missing from self-taught AI portfolios, and the part interviewers probe hardest. The
research-flavored topics come last: they are valuable to understand, but fine-tuning and
multi-agent orchestration are rarely what a full-stack role actually needs.

### Milestone 2 — RAG hardening and measurement · next

A retrieval system whose quality you can state as a number.

- A swappable vector store interface in `core/`, with Chroma (via Docker) for
  persistence and `MemoryVectorStore` kept as the zero-setup default.
- Multi-document ingestion with source metadata on every chunk.
- A similarity threshold and a real "I don't know" path. Today three chunks come back no
  matter how irrelevant they are: an off-topic question scored ~0.39 while a genuine
  match scored ~0.80, and both returned three chunks.
- A golden question set scored with recall@k and MRR. This becomes the baseline every
  later retrieval change has to beat.

### Milestone 3 — Streaming and conversations · planned

The two things that make it feel like a real product, and the biggest MERN gap: the app
currently stores nothing.

- Token-by-token streaming over Server-Sent Events, with cancellation.
- Threads and messages persisted in MongoDB.
- Context windows in practice: summarizing or trimming history when a conversation grows
  past what the model can read.
- A minimal user concept, hardened into real auth in Milestone 6.

### Milestone 4 — Providers and cost · planned

- One provider interface covering Ollama plus a hosted API, with fallback and retry.
- Token counting, per-request cost, and a latency budget.
- Caching, including semantic caching of similar questions.
- Choosing a cheap model for easy requests and an expensive one only when needed.

### Milestone 5 — Document pipeline · planned

- PDF and Markdown upload with parsing.
- Embedding as a background job with progress reporting, instead of blocking a request.
- Re-indexing, incremental updates, and deletion.

### Milestone 6 — Security and multi-tenancy · planned

- Prompt injection: what happens when an ingested document says "ignore your
  instructions," and the defenses that help.
- Per-user data isolation, so one user's retrieval can never reach another's chunks.
- Auth, rate limiting, and request size caps. `/api/rag/reingest` is currently
  unauthenticated and uncapped.
- PII handling and output sanitization.

### Milestone 7 — Semantic search beyond chat · planned

Embeddings used for search, deduplication, clustering, and recommendations. Most
products need this more than they need a chatbot.

### Milestone 8 — Advanced retrieval · planned

Hybrid keyword and vector search, query rewriting, reranking, and parent-document
retrieval. Each is measured against the Milestone 2 baseline, and anything that does not
improve the numbers is recorded as a negative result rather than kept.

### Milestone 9 — Evaluation and hallucination detection · planned

Shared evaluation tooling in `core/`: faithfulness scoring, citation verification that
checks whether a cited chunk actually supports the claim, and an LLM judge calibrated
against human labels. Regression gates in CI so quality cannot silently degrade.

### Milestone 10 — Agents and tool calling · planned

Tool calling from first principles before reaching for a framework, a bounded reasoning
loop with step limits, and agent evaluation: task completion, step efficiency, tool-call
accuracy. Multi-agent handoff last, with an honest look at when it is just overhead.

### Milestone 11 — Observability and deployment · planned

Tracing a request through retrieval and generation with latency and token counts,
structured logging, Docker for the full stack, CI, and graceful degradation when a model
is unavailable.

### Milestone 12 — LLM fundamentals · in progress

Started early, ahead of the rest of this roadmap. The interview gap was being able to
explain what an LLM is actually doing, so the sampling playground comes before more RAG
work. Tokens, context windows, and prompt patterns still follow.

Done in this slice: temperature, top-p, seed, max tokens, and real token counts shown
next to the `characters / 4` estimate. Still to come: few-shot and chain-of-thought
prompts, and structured JSON output with validation.

### Milestone 13 — Advanced topics · planned

Multimodal (local vision and audio, quantization trade-offs), then fine-tuning (SFT,
LoRA, QLoRA) as a Python job on a free Colab or Kaggle GPU, compared against the base
model. Fine-tuning is last on purpose: it is the wrong answer to most problems that
retrieval or a better prompt solves more cheaply, and understanding _why_ matters more
than running one.
