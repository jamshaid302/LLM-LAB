# Advanced RAG module

**Status:** ready · **UI:** sidebar → Retrieval → Advanced RAG · **API prefix:** `/api/advanced-rag`

## What this module is about

Plain vector search has known weak spots. It blurs exact tokens such as a room code or a
port. It ranks question and chunk separately, so a chunk with the right fact and odd
wording can sit at rank 5. And a small chunk can lose the sentence around it. This page
runs four fixes on the same questions as plain vector search:

- **Hybrid:** BM25 keyword ranking merged with the vector list by reciprocal rank fusion.
- **Overlap rerank:** rescore the nearest 20 by shared words with the question.
- **Cross-encoder:** rescore the nearest 20 with a model that reads question and chunk together.
- **Parent document:** search small chunks, send the whole file each came from.

A pass counts as better only when it raises recall, MRR, or the number of unanswerable
questions the cutoff refuses, and lowers none of them. The cross-encoder won, so RAG,
Conversations, and Agents now retrieve with it. The other three are measured and not used.

**What you learn here:** a second retriever is a hypothesis. You measure it on the same
questions before you let it answer users.

## How it works

```
Compare
   → POST /api/advanced-rag/compare
   → for each question in eval/questions.json
        vector pass       nearest 20 chunks by cosine similarity; the first 3 are "vector"
        hybrid            BM25 over the chunks this person can see, fused with the 20: 1 / (60 + rank), top 3
        overlap rerank    the 20 resorted by shared words, top 3
        cross-encoder     the 20 rescored by ms-marco-MiniLM-L-6-v2, top 3
        parent document   the vector top 3, each replaced by its whole file's text
   → score each list      recall@3, MRR, and how many unanswerable questions fall under 0.5
   → *Kept                true only when that pass is better and nothing got worse
```

The cutoff always uses the cosine score. A chunk the keyword pass finds and the vector
pass does not has no cosine score, so the cutoff drops it. Rerankers only reorder the
20 vector candidates, so every chunk they keep has a cosine score.

`retriever` in the response says what the RAG page actually uses:
`"vector + cross-encoder"` when `RAG_RERANK=cross-encoder` (the default), `"vector"` when
it is `off`. The `vector` card on this page is always plain vector search, so the
comparison stays fair either way.

## How we implemented it

This module does not import RAG. `backend/src/modules/index.js` passes the wide vector
search, the chunk list, the question file, the scorer, and the cross-encoder.

| File | What it does |
| --- | --- |
| `hybrid.js` | Tokenizes text, ranks chunks with BM25, fuses ranked lists, and decides whether one report beats another. |
| `expand.js` | The overlap reranker and the parent-document expansion. |
| `../../core/cross-encoder.js` | Loads the cross-encoder once and reorders hits by its score. Shared with RAG. |
| `service.js` | Runs the question set through all five lists. If the cross-encoder fails, the error is returned and the other four still score. |
| `router.js` | `POST /compare`. Uses the signed-in account. |
| `index.js` | Module id `advanced-rag`. Health reports `retriever`. |

### Frontend (`frontend/src/modules/advanced-rag/AdvancedRagPage.jsx`)

A **Compare retrieval** button. Five cards, each with recall and MRR before and after the
cutoff, unanswerable refusals, and whether that pass was kept. Each card lists the
questions it missed. The line above the button says what RAG answers with. It comes from
the API health check, so it is there before the comparison runs. The score uses the
signed-in account's files plus the shared samples.

## What the measurement said

Measured 29 October 2026 with `nomic-embed-text`, k of 3, cutoff 0.5, 20 candidates, 9
shared files (101 chunks), 49 answerable and 8 unanswerable questions. 8 answerable ones
need two facts; 7 of those have the facts in different chunks. The same numbers are
saved under `rerank` in `eval/baseline.json` by `npm run eval:rerank -- --write`, and
the run was repeated with identical results. The retrieval baseline was measured again
on 30 October 2026 after `learning-guide.md` was added: 10 files, 108 chunks, and the
cross-encoder recall and MRR did not drop. The comparison table was not re-run.

| Pass | Recall@3 after cutoff | MRR after cutoff | Unanswerable refused | Kept |
| --- | --- | --- | --- | --- |
| Vector | 0.959 | 0.884 | 2/8 | baseline |
| Hybrid | 0.98 | 0.895 | 2/8 | better |
| Overlap rerank | 0.898 | 0.796 | 2/8 | worse |
| Cross-encoder | 1.0 | 0.915 | 2/8 | better, and best |
| Parent document | 0.98 | 0.959 | 2/8 | better on MRR, not used |

What the misses were:

- Vector missed two two-fact questions: "When are expense reports due, and where are
  business trips booked?" (`knowledge.txt` and `travel-expenses.md`) and "What is the
  server room access code, and which extension reaches the IT service desk?"
  (`knowledge.txt` and `it-security.md`). The second chunk sat below rank 3.
- Hybrid recovered the server room one and still missed the expense one.
- Overlap rerank lost five, including "What is QLoRA?". Shared words are a worse
  relevance signal than the embedding. That is why "a reranker" is not automatically
  an improvement.
- The cross-encoder recovered both and missed nothing.
- Parent document has the best MRR because a whole file contains every fact in it, but it
  sends far more text to the model. That costs tokens and gives a small model more to
  confuse. It was not adopted.

None of the passes refuses more unanswerable questions. That is not retrieval's job here:
a question like "What is the wifi password for the employee network?" really is close to
the visitor wifi chunk. The prompt and grounding check handle it.

## API

`POST /api/advanced-rag/compare` takes no body. It returns `{ "kept", "rerankKept",
"crossEncoderKept", "parentKept", "retriever", "k", "minScore", "candidateK",
"crossEncoderModel", "crossEncoderError", "vector", "hybrid", "rerank", "crossEncoder",
"parent" }`. `kept` is the hybrid decision. `crossEncoder` is `null` and
`crossEncoderError` explains why when the model could not run. An unknown user is HTTP 400.

Each report is the same retrieval report as `POST /api/rag/eval`: recall, MRR, and
per-question detail.

## Test plan

### Automated tests

Run from `backend/`:

```bash
npm test
```

| File | What it checks |
| --- | --- |
| `tests/modules/advanced-rag/hybrid.test.js` | BM25 ranks the chunk with the rare term first. Fusion promotes that chunk and keeps its cosine score. An equal report is not an improvement. A drop in MRR is not an improvement. A higher recall with nothing else worse is an improvement. The route reports `kept: true` when the keyword pass puts the answer inside k, and `kept: false` when the lists agree. The cross-encoder is kept when it moves the answer inside k from the wide list. Without a cross-encoder the compare still returns, with the reason. An unknown user is HTTP 400, and another person's chunk is never scored. |
| `tests/modules/advanced-rag/expand.test.js` | The overlap reranker and the parent-document expansion. |
| `tests/core/cross-encoder.test.js` | The cross-encoder wrapper: one load, retry after a failed load, ordering, and the one-time download. |

These tests do not call Ollama or download the model.

### Manual tests

The full lab, in order, is in [docs/test-plan.md](../../../../docs/test-plan.md). The rows below are this module.

Start the API, Ollama, and the frontend. Open **Advanced RAG**.

| Step | Expected result |
| --- | --- |
| Read the line above the button | RAG answers with: vector + cross-encoder |
| Click **Compare retrieval** | Five cards with the numbers in the table above (they take a minute or two). Vector lists two missed questions; Cross-encoder lists none; Overlap rerank lists five |
| Ask "What is the server room access code, and which extension reaches the IT service desk?" on the RAG page | Both facts: 4829 and extension 7000. The sources include `knowledge.txt` and `it-security.md` |
| Set `RAG_RERANK=off`, restart the API, and reload | The line says vector. The cards are the same, because the comparison never depended on that setting. Remove the setting afterward |

## Known limitations

- **The cross-encoder adds time.** Rescoring 20 chunks on this machine's CPU took 1.1 to
  1.6 seconds per question, measured while Ollama was also generating. That is small
  next to a 7b answer, and large next to the embedding call. The first question after a
  start also loads the model: about 2 seconds from the cache, about 20 seconds in a fresh
  container that has to download it. The trace records `rerankMs`.
  `RERANK_CANDIDATES=10` halves the work, at the risk of missing a chunk ranked 11–20.
- **The model is English-only.** `ms-marco-MiniLM-L-6-v2` was trained on English web
  search queries. Other languages need a multilingual reranker, measured the same way.
- **Query rewriting already lives on Conversations.** A follow-up is turned into a
  standalone search string before the vector pass. This page does not do that again.
- **HyDE, multi-query, and graph retrieval are not built.** See [docs/concepts.md](../../../../docs/concepts.md)
  for how each would be added and measured here.
- **The comparison calls the embedding model once per question.** It is a button, not
  something the ask path runs.
