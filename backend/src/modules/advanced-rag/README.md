# Advanced RAG module

**Status:** ready · **UI:** sidebar → Retrieval → Advanced RAG · **API prefix:** `/api/advanced-rag`

## What this module is about

Vector search finds similar meaning and misses exact tokens: a room code, a port, a
password. Keyword search (BM25) does the opposite. Hybrid search runs both and merges
the lists with reciprocal rank fusion.

The merge is kept only when it raises recall, MRR, or the number of unanswerable
questions the cutoff refuses, and lowers none of them. On this knowledge base it did
not, so RAG and Semantic Search still retrieve with vectors alone.

**What you learn here:** a second retriever is a hypothesis. You measure it on the same
questions before you let it answer users.

## How it works

```
Compare
   → POST /api/advanced-rag/compare
   → for each question in eval/questions.json
        vector pass     top 20 chunks by cosine similarity
        keyword pass    BM25 over the chunks this person can see
        fusion          1 / (60 + rank) added across the two lists, then top 3
   → score both lists   recall@3, MRR, and how many unanswerable questions fall under 0.5
   → kept               true only when hybrid is strictly better and nothing got worse
```

`kept: false` does not change `retrieve`. Asking on the RAG page still uses the vector
top 3 and the 0.5 cutoff.

A chunk the keyword pass finds and the vector pass does not has no cosine score, so the
cutoff drops it. Fusion can reorder chunks the vector pass already returned.

## How we implemented it

This module does not import RAG. `backend/src/modules/index.js` passes the wide vector
search, the chunk list, the question file, and the scorer.

| File | What it does |
| --- | --- |
| `hybrid.js` | Tokenizes text, ranks chunks with BM25, fuses two ranked lists, and decides whether the hybrid report is better. |
| `service.js` | Runs the question set through both retrievers. |
| `router.js` | `POST /compare`. Reads `X-User-Id`. |
| `index.js` | Module id `advanced-rag`. Health reports `retriever: "vector"`. |

### Frontend (`frontend/src/modules/advanced-rag/AdvancedRagPage.jsx`)

A **Compare retrieval** button. The two reports sit side by side. The line above them
says whether hybrid was kept. The button sends `X-User-Id`.

## What the measurement said

Measured 29 October 2026 with `nomic-embed-text`, k of 3, cutoff 0.5, and the current
docs folder (the shared samples plus the cent-trading notes).

| | Recall@3 before | Recall@3 after | MRR before | MRR after | Unanswerable refused |
| --- | --- | --- | --- | --- | --- |
| Vector | 1 | 1 | 1 | 1 | 1/2 |
| Hybrid | 1 | 1 | 1 | 1 | 1/2 |

Every answerable question already had the right chunk at rank 1, including `4829`,
`11434`, and `lantern-42`. Brazil stayed under the cutoff (vector top score 0.436,
hybrid 0.407). "Who is the CEO?" stayed above it at 0.566 for both. Hybrid was not
adopted.

## API

`POST /api/advanced-rag/compare` takes no body. It returns `{ "kept", "retriever", "k", "minScore", "candidateK", "vector", "hybrid" }`. `retriever` is `"vector"` because that is the path still in use. An unknown `X-User-Id` is HTTP 400.

The `vector` and `hybrid` objects are the same retrieval report as `POST /api/rag/eval`: recall, MRR, and per-question detail.

## Test plan

### Automated tests

Run from `backend/`:

```bash
npm test
```

| File | What it checks |
| --- | --- |
| `tests/modules/advanced-rag/hybrid.test.js` | BM25 ranks the chunk with the rare term first. Fusion promotes that chunk and keeps its cosine score. An equal report is not an improvement. A drop in MRR is not an improvement. A higher recall with nothing else worse is an improvement. The route reports `kept: true` when the keyword pass is what puts the answer inside k, and `kept: false` when the lists agree. An unknown user is HTTP 400. |

These tests do not call Ollama.

### Manual tests

The full lab, in order, is in [docs/test-plan.md](../../../../docs/test-plan.md). The rows below are this module.

Start the API, Ollama, and the frontend. Open **Advanced RAG**.

| Step | Expected result |
| --- | --- |
| Click **Compare retrieval** | Two cards. Recall@3 is 100% before and after on both. MRR is 1.00 on both. Unanswerable refused is 1/2 on both. The line says hybrid did not beat vector search |
| Ask "What is the server room access code?" on the RAG page | The answer still comes from vector search. The source is `knowledge.txt` |

## Known limitations

- **Reranking is not built.** A second model that rescores the top 20 is a later measurement, with the same rule: keep it only if the numbers rise.
- **Parent-document retrieval is not built.**
- **Query rewriting already lives on Conversations.** A follow-up is turned into a standalone search string before the vector pass. This page does not do that again.
- **The comparison calls the embedding model once per question.** It is a button, not something the ask path runs.
