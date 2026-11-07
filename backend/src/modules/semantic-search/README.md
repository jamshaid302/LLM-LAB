# Semantic search module

**Status:** ready · **UI:** sidebar → Retrieval → Semantic Search · **API prefix:** `/api/semantic-search`

## What this module is about

RAG uses a search result as context for a generated answer. Semantic search returns the
result itself. The question is "which paragraph is closest to these words?" and the
reply is that paragraph, plus a score. The chat model is not called.

The embedding step is the same one RAG uses. A query is turned into a vector with
`nomic-embed-text`, and the nearest chunks come back from the same store.

**What you learn here:** a product can need search, and not need a chatbot. The score
is cosine similarity. The cutoff is the same line RAG uses, so a weak neighbor is shown
as dropped and is not described as a match.

## How it works

```
Search
   → POST /api/semantic-search/query    { "query" } and X-User-Id
   → the RAG store                      embed the query, keep shared chunks and this person's chunks
   → retrieval cutoff                   score >= RAG_MIN_SCORE is kept
   → JSON                               matched and dropped chunks, each with text, score, and source
```

There is no prompt and no Ollama chat call on this path. Who is asking works the same
way as on the RAG page: a missing header is Local, and an unknown header is HTTP 400.

## How we implemented it

This module does not import the RAG module. `backend/src/modules/index.js` passes a
`search` function that calls `ragService.retrieve` and `applyCutoff`.

| File | What it does |
| --- | --- |
| `service.js` | Checks the query, then returns the kept and dropped chunks. |
| `router.js` | `POST /query`. Reads `X-User-Id`. |
| `index.js` | Module id `semantic-search`. Health reports the cutoff. |

### Frontend (`frontend/src/modules/semantic-search/SemanticSearchPage.jsx`)

A search box. Kept chunks are listed with the file name and the score. Chunks under the
cutoff are listed separately. The page sends `X-User-Id`.

## API

`POST /api/semantic-search/query`

```json
{ "query": "Where is the gym?" }
```

```json
{
  "query": "Where is the gym?",
  "minScore": 0.5,
  "matched": [{ "text": "The company gym is located on the 3rd floor...", "score": "0.774", "source": "knowledge.txt" }],
  "dropped": [{ "text": "Pets are allowed...", "score": "0.430", "source": "knowledge.txt" }]
}
```

A blank query is HTTP 400, `Missing 'query'`. A query over 4000 characters is HTTP 400.
`X-User-Id: bob` is HTTP 400, `Choose local or guest`.

## Test plan

### Automated tests

Run from `backend/`:

```bash
npm test
```

| File | What it checks |
| --- | --- |
| `tests/modules/semantic-search/search.test.js` | A gym query returns the gym chunk and no answer field. A maple query against a gym-only file is dropped. A guest file is returned for Guest and absent for Local. A blank query and an unknown user are HTTP 400. |

The tests use the fake keyword embeddings and a memory store. They do not call Ollama.

### Manual tests

The full lab, in order, is in [docs/test-plan.md](../../../../docs/test-plan.md). The rows below are this module.

Start the API and the frontend. Open **Semantic Search**.

| Step | Expected result |
| --- | --- |
| Search `Where is the company gym?` | A kept chunk from `knowledge.txt` mentions the 3rd floor. The score is about 0.8. There is no generated sentence |
| Search `What is the capital of Brazil?` | Nothing is kept. Dropped scores are about 0.39 |
| Search `What is the visitor wifi password?` | A kept chunk from `office.txt` contains `lantern-42` |
| Switch **Who is asking** to Guest and search the gym question | The same shared `knowledge.txt` chunk is kept |

## Known limitations

- **Deduplication, clustering, and recommendations are not built.** This page is nearest-chunk search.
- **The cutoff is the RAG cutoff.** `RAG_MIN_SCORE` defaults to 0.5. Neighbors under that line are still returned, under "Below the cutoff."
- **Search uses the same chunks as RAG.** An upload on the RAG page is what adds a file. This page does not upload.
- **This is a switch, not a login.** Guest does not see Local's uploads. Shared files stay visible to both.
