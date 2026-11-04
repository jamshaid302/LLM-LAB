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
docs/*.txt
   → corpus.js         read every text file; hash the names and the text together
   → chunking.js       split each file into overlapping ~400-character chunks
   → embeddings        each chunk becomes a vector (nomic-embed-text via Ollama)
   → vector store      Chroma when RAG_STORE=chroma, otherwise the original MemoryVectorStore
   → ask(question)     embed the question, take the top 3 nearest chunks
   → retrieval.js      drop any chunk below RAG_MIN_SCORE (default 0.5)
   → if none remain    return "I don't know" and do not call the model
   → prompt.js         number the kept chunks and name the source file
   → POST /stream      send the answer one token at a time; Stop closes the stream
```

The answer comes back with the chunks it kept, the ones it dropped, and a similarity
score for each. Close to 1 means very similar. On this corpus, real matches score about
0.57–0.80 and a clearly unrelated question scores about 0.39.

## How we implemented it

### Backend (`backend/src/modules/rag/`)

| File | What it does |
| --- | --- |
| `chunking.js` | Splits text with LangChain's `RecursiveCharacterTextSplitter`. Rejects an overlap that is not smaller than the chunk size. No network. |
| `prompt.js` | Numbers the retrieved chunks and builds the grounding prompt, including the exact refusal sentence. No network. |
| `retrieval.js` | Applies the score cutoff and scores a question set with recall@k and mean reciprocal rank, before and after the cutoff. No network. |
| `store.js` | Two stores. `createMemoryStore` is the original in-process store. `createChromaStore` keeps the same chunks in Chroma and turns Chroma's cosine distance back into a similarity score. |
| `router.js` | `POST /ask`, `POST /reingest`, and `POST /eval`. A missing question is rejected with a 400 before the model is called. |
| `corpus.js` | Reads one text file, or every `.txt` file in a folder. The hash includes each file name and its text, in sorted order. |
| `index.js` | The module definition: id, router, startup load, and chunk count, cutoff, and store name for `/api/health`. |
| `rag-service.js` | The pipeline: read the corpus, split each file, stamp each chunk with that file's name, embed, store, search, drop weak chunks, call the model only when something remains. On startup it reuses Chroma when the folder hash matches, and skips a new embed. The model, embeddings, and store are passed in, so tests can use fakes. |
| `docs/knowledge.txt` | The original sample knowledge base. |
| `docs/office.txt` | A second file. The visitor wifi password lives here, so a chunk from this file is labeled `office.txt`. |
| `eval/questions.json` | 11 answerable questions with the phrase that should appear in the retrieved chunk, plus 2 questions the corpus cannot answer. |
| `eval/baseline.json` | The scores from a real `nomic-embed-text` run. Recall@3 stayed 1.0 after the cutoff. |

Settings come from `backend/.env` through `core/config.js`: `RAG_TOP_K` (default 3),
`RAG_MIN_SCORE` (0.5), `RAG_CHUNK_SIZE` (400), `RAG_CHUNK_OVERLAP` (50), `RAG_STORE`
(`chroma` in `.env`, `memory` if unset), `CHROMA_URL` (`http://localhost:8000`), and the model names.

Chroma runs from `backend/docker-compose.yml`:

```bash
docker compose up -d
```

### Frontend (`frontend/src/modules/rag/RagPage.jsx`)

A chat panel that posts to `/api/rag/ask`, shows each kept chunk with its file name and
score, and lists dropped chunks as below the cutoff. The line above the buttons names
the vector store. **Re-ingest docs** rebuilds the store. **Score retrieval** calls
`/api/rag/eval` and prints recall before and after the cutoff.

### Design decisions

**Chroma, with the original memory store kept.** `createMemoryStore` in `store.js` is
the store this module started with. Tests still use it, and `RAG_STORE=memory` selects
it with no Docker. `RAG_STORE=chroma` writes the same chunks to Chroma. A restart that
finds the same folder hash loads them and does not call the embedding model. Chroma's
cosine distance is converted back to similarity, so the 0.5 cutoff still means the same
thing: the gym chunk scored 0.774 after the move, and recall@3 stayed 1.0.

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
  "refused": false,
  "matchedSources": [{ "text": "The company gym is located on the 3rd floor...", "score": "0.774", "source": "knowledge.txt" }],
  "droppedSources": [{ "text": "Pets are allowed...", "score": "0.430", "source": "knowledge.txt" }]
}
```

When every hit is below the cutoff, `refused` is true, `matchedSources` is empty, and
`answer` is the refusal sentence. The model is not called.

`POST /api/rag/stream` takes the same `{ "question" }` body and answers with
Server-Sent Events: a `meta` event (kept and dropped chunks), then `token` events, then
`done`. Closing the connection stops the model. A weak retrieval still skips the model
and sends the refusal as one token.

`POST /api/rag/reingest` rebuilds the store from every `.txt` file in `docs/` and returns
`{ "status": "ok", "chunks": 7 }`.

`POST /api/rag/eval` embeds every question in `eval/questions.json` and returns
`recallAtK`, `mrr`, and `refusedByCutoff`. It does not call the chat model.

`GET /api/health` reports the chunk count, `minScore`, and `store` under `modules.rag`.

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
| `tests/modules/rag/store.test.js` | Cosine distance converts back to similarity. The memory store replaces chunks instead of appending. The Chroma adapter does the same against a fake client and keeps the file name. |
| `tests/modules/rag/retrieval.test.js` | The cutoff splits hits into kept and dropped. Recall stays 1 when the right chunk is above the line, and falls when the cutoff removes that chunk. An unanswerable question whose hits are all below the line counts as refused. |
| `tests/modules/rag/rag-service.test.js` | Ingestion counts chunks; re-ingesting does not duplicate them; at most top-K sources come back, each with a score and the file name `knowledge.txt`; a folder of two files labels the gym chunk `knowledge.txt` and the wifi chunk `office.txt`; adding a file changes the corpus hash; a cutoff above every score refuses without calling the model; a cutoff of 0.8 keeps the gym chunk and reports the rest as dropped; a missing corpus file fails clearly. |
| `tests/app.test.js` (RAG section) | `/api/rag/ask` returns the service's answer; a missing question gets 400 and never reaches the model; a pipeline error becomes a JSON 500; `/api/rag/reingest` rebuilds the store; `/api/rag/eval` returns the report. |

### Manual tests

Start the backend and frontend, open **RAG**, and check each row.

| Step | Expected result |
| --- | --- |
| Watch the backend log after `office.txt` is added | `[rag] 7 chunks embedded into chroma` |
| Restart the API without changing the docs folder | `[rag] 7 chunks loaded from chroma` |
| Read the line above the buttons | `Vector store: chroma` |
| Ask "Where is the company gym?" | The answer grows token by token. 3rd floor, open 24/7; top source scores about 0.8 |
| Click **Stop** while an answer is still arriving | The partial text stays, with a Stopped line. The model call ends |
| Ask "When are pets allowed in the office?" | Fridays only; top source scores about 0.7 |
| Ask "What is the capital of Brazil?" | "I don't know", with no kept sources. Dropped scores are about 0.39. The model is not called |
| Ask "Who is the CEO of the company?" | This one still reaches the model. Its top score was 0.566, just above the 0.5 cutoff |
| Ask "What is the visitor wifi password?" | lantern-42. The source line says `office.txt` and the top score is about 0.84 |
| Click **Score retrieval** | Recall@3 before 100%, after 100%. Unanswerable refused: 1/2 |
| Add a sentence to a file in `docs/`, click **Re-ingest docs**, ask about it | The new fact is answered and its chunk is labeled with that file's name |
| Stop Ollama and ask anything | An error message in the chat, not a frozen page |

Brazil is refused because retrieval found nothing strong enough to send. The CEO question
is the remaining hole: the words overlap the corpus enough to clear 0.5, and the prompt
is again the only thing stopping a made-up name.

## Known limitations

Each is scheduled in the [roadmap](../../../../README.md#roadmap):

- **The cutoff is a blunt threshold.** It refused Brazil (0.394) and kept every answerable question, including the leash question at 0.571. It did not refuse "Who is the CEO?" (0.566). Raising it further would start dropping real answers.
- **Citations are unverified.** Nothing checks that a cited chunk supports the claim.
- **Text files only.** The loader reads `.txt` in `docs/`. A PDF still needs the document pipeline.
- **No conversation memory on this page.** Each question is answered on its own. Saved threads live in Conversations.
- **`/api/rag/reingest` is unauthenticated.** Fine locally, not once deployed.

## Experiments

1. Drop another `.txt` file into `docs/` and click **Re-ingest docs**. Ask a question
   whose answer is only in that file. The source line should name the new file.
2. Set `RAG_CHUNK_SIZE=100` in `backend/.env` and restart. Answers fragment because
   chunks stop holding complete thoughts.
3. Set `RAG_TOP_K=1` and see which questions start failing.
4. Set `RAG_MIN_SCORE=0.6` in `backend/.env`, restart, and click **Score retrieval**.
   Recall after the cutoff should drop, because the leash question scored 0.571. Put it
   back to 0.5 afterward. That is the tradeoff the baseline records.
