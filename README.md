# AI Engineering Lab

One AI platform for learning AI engineering end to end: a single React frontend and a
single Express backend, with each technique (RAG, evaluation, agents, and more) built
as a module you pick from the sidebar.

Everything runs locally against [Ollama](https://ollama.com) by default. No paid API
keys are required.

Interview questions and answers for every module, built and planned, are in
[docs/interview-prep.md](docs/interview-prep.md).

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

### Why Chroma and MongoDB are both here

They answer different questions.

**Chroma** is the vector database. It stores the embeddings of the `.txt` files in the RAG docs folder. A question
is embedded the same way, and Chroma returns the nearest chunks. That is how the app
finds "the gym is on the 3rd floor" when those words are not in the chat.

**MongoDB** is the conversation record. It stores threads and messages in order: who
said what, and when. The next prompt copies the recent turns out of MongoDB so the
model can continue from what was already said. "What is my name?" works because an
earlier message said the name, not because that sentence was embedded.

A vector search cannot reliably return "message 1, then message 2, then message 3."
A document database cannot find the nearest paragraph in the knowledge base. Using one
database for both jobs would mix old chat text into the gym search, or lose the order
of the transcript. The detailed version is in the
[Conversations README](backend/src/modules/conversations/README.md#why-mongodb-and-chroma).

### Modules

Each built module has its own README covering what it teaches, how it works, how it was
implemented, its API, and a test plan with automated and manual checks. This file only
summarizes them.

| Module                  | Status    | What it teaches                                                                      | Docs                                                  |
| ----------------------- | --------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| LLM Fundamentals        | **ready** | Tokens, sampling, prompt patterns, and validated JSON output                         | [README](backend/src/modules/fundamentals/README.md)  |
| Providers & Cost        | **ready** | Two local models behind one chat call, with tokens, latency, and a $0 price          | [README](backend/src/modules/providers/README.md)     |
| RAG                     | **ready** | Chunking, embeddings, similarity search, and grounding answers in your own documents | [README](backend/src/modules/rag/README.md)           |
| Advanced RAG            | planned   | Hybrid search, reranking, and query rewriting, measured against basic RAG            | —                                                     |
| Semantic Search         | planned   | Embeddings outside chat: search, deduplication, clustering, recommendations          | —                                                     |
| Document Pipeline       | planned   | PDF and Markdown upload, parsing, and embedding as background jobs                   | —                                                     |
| Streaming Chat          | **ready** | Token-by-token answers over Server-Sent Events, with cancellation                    | [README](backend/src/modules/streaming/README.md)     |
| Conversations           | **ready** | Threads and messages in MongoDB, replayed into the next prompt alongside Chroma      | [README](backend/src/modules/conversations/README.md) |
| LLM Evaluation          | planned   | Golden datasets, retrieval metrics, and LLM-as-judge scoring                         | —                                                     |
| Hallucination Detection | planned   | Checking that answers and citations are supported by the sources                     | —                                                     |
| AI Agents               | planned   | Tool calling, a bounded reasoning loop, and agent evaluation                         | —                                                     |
| Multi-Agent Systems     | planned   | Agents handing work to each other, and when that is overhead                         | —                                                     |
| Security                | planned   | Prompt injection, PII, output sanitization, per-user data isolation                  | —                                                     |
| Observability           | planned   | Tracing requests with latency and token cost                                         | —                                                     |
| Deployment              | planned   | Docker, CI, rate limiting, graceful degradation                                      | —                                                     |
| Multimodal AI           | planned   | Local vision and audio models, quantization trade-offs                               | —                                                     |
| Fine-Tuning             | planned   | SFT, LoRA, and QLoRA on a GPU worker, compared with the base model                   | —                                                     |

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

### Milestone 2 — RAG hardening and measurement · done

Done: a similarity cutoff at 0.5, the file name on every chunk, and a 12-question set
scored with recall@k and MRR. On `nomic-embed-text`, recall@3 stayed 1.0 after the
cutoff and Brazil (0.394) is refused without calling the model. "Who is the CEO?" at
0.566 still gets through; raising the cutoff would drop the leash question at 0.571.
The numbers are in `backend/src/modules/rag/eval/baseline.json`.

Done after that: Chroma, started with `docker compose up -d` from `backend/`. The
original in-memory store is still in `store.js` and still selected by `RAG_STORE=memory`.
With `RAG_STORE=chroma`, a restart loads the six chunks and does not embed them again.
Recall@3 stayed 1.0. The gym chunk still scored 0.774.

Done after that: every `.txt` file in `docs/` is loaded, and each chunk keeps its own file
name. `office.txt` holds the visitor wifi password. On `nomic-embed-text` that question
scored 0.843, recall@3 stayed 1.0, and the original ten scores did not move. The folder
hash is what Chroma compares on restart. A second file changes it, so the chunks are
embedded again. Seven chunks in total.

### Milestone 3 — Streaming and conversations · in progress

Done: token-by-token answers over Server-Sent Events, with a Stop button. Streaming Chat
is the plain demo. The RAG page uses the same mechanism.

Done after that: threads and messages in MongoDB. A reply is saved, and the recent
turns are copied into the next prompt. If Chroma also finds a matching chunk, that
chunk is added to the same prompt. One local user id, `local`, stands in until real
auth. Past 12 messages, the older turns are summarized in one model call. The summary
is saved on the thread and sent with the recent messages. The original messages stay
in MongoDB. A follow-up is rewritten into a standalone search query before Chroma is
called. The reply still sees the sentence the user typed.

Still to come:

- A real user concept, hardened into auth in Milestone 6.

### Milestone 4 — Providers and cost · in progress

Done: one non-streaming chat call, shared with conversation summaries. A request picks
`llama3.2:1b` or `qwen2.5:7b`. The reply records prompt tokens, completion tokens,
latency, and cost. Both local rates are $0 per million. The same counts are also priced
at a sample hosted rate of $0.15 in and $0.60 out, and that figure is labeled as not billed.

Still to come:

- A hosted adapter, with fallback and retry.
- Caching, including semantic caching of similar questions.
- Choosing the small model for an easy request and the larger one only when needed.

### Milestone 5 — Document pipeline · done

The RAG page uploads a `.txt`, `.md`, or `.pdf` file. The API checks the name, writes
the original file into `docs/`, and returns while an in-process job embeds that file.
The page polls until the job is ready or failed, and a failed job can be retried. A
PDF is stored as bytes and chunked from the text extracted in Node. Chunks keep the
file name. Remove waits out an in-flight embed of that file, then drops the file and
its chunks together. `knowledge.txt` and `office.txt` stay. A path, a PDF with no
extractable text, and an empty file are rejected before a job starts. **Re-ingest
docs** still waits and embeds the whole folder. The sidebar item Document Pipeline
stays planned; this work lives on the RAG page. The queue is in memory, so a restart
drops it and startup embeds again because the folder hash changed.

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

Hybrid keyword and vector search, reranking, and parent-document retrieval. Conversations
already rewrite a follow-up into a search query. This milestone measures retrieval
changes against the Milestone 2 baseline, and anything that does not improve the numbers
is recorded as a negative result rather than kept.

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

### Milestone 12 — LLM fundamentals · done

Started early, ahead of the rest of this roadmap, because explaining what an LLM is
doing was the interview gap.

Done: temperature, top-p, seed, max tokens, real token counts next to the
`characters / 4` estimate, a four-way prompt comparison, and structured JSON with one
retry. A reply that still fails validation comes back as 422 with no object.

### Milestone 13 — Advanced topics · planned

Multimodal (local vision and audio, quantization trade-offs), then fine-tuning (SFT,
LoRA, QLoRA) as a Python job on a free Colab or Kaggle GPU, compared against the base
model. Fine-tuning is last on purpose: it is the wrong answer to most problems that
retrieval or a better prompt solves more cheaply, and understanding _why_ matters more
than running one.
