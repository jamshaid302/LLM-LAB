# LLM evaluation module

**Status:** ready · **UI:** sidebar → Quality → LLM Evaluation · **API prefix:** `/api/evaluation`

## What this module is about

A RAG change is a retrieval change first. This page scores the saved question set and
reports whether the right chunk was in the top k. It does not call the chat model.

**What you learn here:** recall@k and MRR, measured before and after the cutoff. An
unanswerable question counts as refused when every hit is under the line.

## How it works

```
Score question set
   → POST /api/evaluation/run
   → the same question file RAG eval uses
   → embed each question, take the top k, apply RAG_MIN_SCORE
   → recall@k, MRR, and one row per question
```

Who is asking limits the search to the shared samples plus that person's files. The
golden questions are about the shared samples.

## How we implemented it

This module does not import RAG. `backend/src/modules/index.js` passes `ragService.evaluate`.

| File | What it does |
| --- | --- |
| `service.js` | Runs the injected scorer. |
| `router.js` | `POST /run`. Reads `X-User-Id`. |
| `index.js` | Module id `evaluation`. Health reports `kind: "retrieval"`. |

### Frontend (`frontend/src/modules/evaluation/EvaluationPage.jsx`)

**Score question set** shows recall, MRR, and a row per question: found, missed, refused,
or not refused, with the top score.

## API

`POST /api/evaluation/run` takes no body. The JSON is the retrieval report: `k`,
`minScore`, `recallAtK`, `mrr`, `refusedByCutoff`, `details`, and `unanswerableDetails`.
An unknown `X-User-Id` is HTTP 400.

## Test plan

### Automated tests

Run from `backend/`:

```bash
npm test
```

| File | What it checks |
| --- | --- |
| `tests/modules/evaluation/quality.test.js` | The route returns the retrieval report. An unknown user is HTTP 400. |

The test uses an injected report. It does not call Ollama.

### Manual tests

The full lab, in order, is in [docs/test-plan.md](../../../../docs/test-plan.md).

| Step | Expected result |
| --- | --- |
| Click **Score question set** | Recall@3 is 100% before and after. MRR after is 1.00. Unanswerable refused is 1/2. Brazil says refused. The CEO question says not refused |

## Known limitations

- **This is retrieval only.** It does not grade the words the model wrote. That check is Hallucination Detection.
- **There is no LLM judge and no CI gate.** A judge would be a second model call, checked against labels you wrote yourself. That is not built.
- **The question file is the one in the RAG module.** Adding a question means editing that file.
