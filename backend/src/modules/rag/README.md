# RAG module

**Status:** ready · **UI:** sidebar → Retrieval → RAG · **API prefix:** `/api/rag`

## What this module is about

A language model only knows what it saw during training. It knows nothing about your
company's documents, and when asked about them it tends to invent a plausible answer.

**Retrieval-augmented generation (RAG)** fixes that by looking things up first:

1. Split your documents into small **chunks**.
2. Turn each chunk into an **embedding**: a list of numbers where texts with similar
   meanings end up close together.
3. When a question arrives, embed it the same way and find the closest chunks
   (**similarity search**).
4. Paste those chunks into the prompt and tell the model to answer only from them.

**What you learn here:** why chunk size and overlap change answer quality, what a
similarity score actually means, how a grounding prompt constrains a model, and where
simple RAG breaks down.

## How it works

```
docs/knowledge.txt
   → chunking.js       split into overlapping ~400-character chunks
   → embeddings        each chunk becomes a vector (nomic-embed-text via Ollama)
   → vector store      MemoryVectorStore, compared by cosine similarity
   → ask(question)     embed the question, take the top 3 nearest chunks
   → prompt.js         number the chunks [1], [2], [3] and build a grounding prompt
   → LLM               answer from that context, or say "I don't know"
```

The answer comes back with the chunks it used and a similarity score for each. Close to
1 means very similar; real matches here score around 0.7–0.8, unrelated chunks around
0.4.

## How we implemented it

### Backend (`backend/src/modules/rag/`)

| File | What it does |
| --- | --- |
| `chunking.js` | Splits text with LangChain's `RecursiveCharacterTextSplitter`. Rejects an overlap that is not smaller than the chunk size. No network. |
| `prompt.js` | Numbers the retrieved chunks and builds the grounding prompt, including the exact refusal sentence. No network. |
| `rag-service.js` | The pipeline: read the corpus, split, embed, store, search, call the model. The model and embedding clients are passed in, so tests can use fakes. |
| `router.js` | `POST /ask` and `POST /reingest`. A missing question is rejected with a 400 before the model is called. |
| `index.js` | The module definition: id, router, startup ingestion, and chunk count for `/api/health`. |
| `docs/knowledge.txt` | The sample knowledge base. |

Settings come from `backend/.env` through `core/config.js`: `RAG_TOP_K` (default 3),
`RAG_CHUNK_SIZE` (400), `RAG_CHUNK_OVERLAP` (50), and the model names.

### Frontend (`frontend/src/modules/rag/RagPage.jsx`)

A chat panel that posts to `/api/rag/ask`, shows each answer with its sources and
scores, and has a **Re-ingest docs** button that calls `/api/rag/reingest`.

### Design decisions

**`MemoryVectorStore` instead of FAISS.** FAISS for Node needs native C++ builds that
often fail on Windows. `MemoryVectorStore` does the same similarity search with no
native code. The cost is that nothing persists: every restart re-embeds the corpus.
Milestone 2 adds Chroma behind a swappable interface.

**Express instead of NestJS.** NestJS's modules and decorators pay off in large
services, but here the goal is to read the RAG pipeline top to bottom.

## API

`POST /api/rag/ask`

```json
{ "question": "Where is the company gym?" }
```

Returns:

```json
{
  "answer": "The company gym is located on the 3rd floor and is open 24/7.",
  "matchedSources": [{ "text": "The company gym is located on the 3rd floor...", "score": "0.802" }]
}
```

`POST /api/rag/reingest` rebuilds the store from `docs/knowledge.txt` and returns
`{ "status": "ok", "chunks": 6 }`.

`GET /api/health` reports the chunk count under `modules.rag`.

## Test plan

### Automated tests

Run from `backend/`:

```bash
npm test
```

None of these need Ollama. The service tests use a fake embedding function that scores
by shared keywords, so search results are predictable.

| File | What it checks |
| --- | --- |
| `tests/modules/rag/chunking.test.js` | Long text splits into several chunks, each within the size limit; short text stays one chunk; an invalid overlap is rejected. |
| `tests/modules/rag/prompt.test.js` | Chunks are numbered from `[1]`; the prompt contains the question, every chunk, and the refusal instruction; it ends with `Answer:`. |
| `tests/modules/rag/rag-service.test.js` | Ingestion counts chunks; re-ingesting does not duplicate them; at most top-K sources come back, each with a score; the chunk containing the query word ranks first; a missing corpus file fails clearly. |
| `tests/app.test.js` (RAG section) | `/api/rag/ask` returns the service's answer; a missing question gets 400 and never reaches the model; a pipeline error becomes a JSON 500; `/api/rag/reingest` rebuilds the store. |

### Manual tests

Start the backend and frontend, open **RAG**, and check each row.

| Step | Expected result |
| --- | --- |
| Watch the backend log on startup | `[rag] 6 chunks embedded` |
| Ask "Where is the company gym?" | 3rd floor, open 24/7; top source scores about 0.8 |
| Ask "When are pets allowed in the office?" | Fridays only; top source scores about 0.7 |
| Ask "What is the capital of Brazil?" | "I don't know based on the provided documents." Top scores are all around 0.4 |
| Add a sentence to `docs/knowledge.txt`, click **Re-ingest docs**, ask about it | The new fact is answered and its chunk appears in the sources |
| Stop Ollama and ask anything | An error message in the chat, not a frozen page |

The Brazil question is the most important one. The model refuses correctly, but
retrieval still passed it three unrelated chunks. Right now only the prompt instruction
stops a wrong answer.

## Known limitations

Each is scheduled in the [roadmap](../../../../README.md#roadmap):

- **Retrieval is unconditional.** Three chunks come back no matter how low their scores.
- **Citations are unverified.** Nothing checks that a cited chunk supports the claim.
- **No source metadata.** A chunk cannot say which document it came from.
- **No conversation memory.** Each question is answered on its own.
- **No streaming.** The UI waits for the whole answer.
- **`/api/rag/reingest` is unauthenticated.** Fine locally, not once deployed.

## Experiments

1. Replace `docs/knowledge.txt` with your own notes and click **Re-ingest docs**.
2. Set `RAG_CHUNK_SIZE=100` in `backend/.env` and restart. Answers fragment because
   chunks stop holding complete thoughts.
3. Set `RAG_TOP_K=1` and see which questions start failing.
4. Ask ten questions the corpus cannot answer and count how many get a confident wrong
   answer. That count is what Milestone 2 turns into a tracked number.
