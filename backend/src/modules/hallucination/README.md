# Hallucination detection module

**Status:** ready · **UI:** sidebar → Quality → Hallucination Detection · **API prefix:** `/api/hallucination`

## What this module is about

A fluent answer can still be unsupported. This page asks one question through the RAG
pipeline and names the outcome: the search missed, the answer was replaced, or the
answer is grounded.

The check is the same word check the RAG page already runs. A reply that is only a
citation, or that uses a name or code missing from the kept chunks, becomes "I don't
know". A name the file itself states is kept.

**What you learn here:** the refusal can come from retrieval or from the answer. Those
are different failures.

## How it works

```
Check
   → POST /api/hallucination/check    { "question" }
   → RAG ask                          retrieve, cutoff, then the model if anything was kept
   → groundAnswer                     names and codes must appear in the kept chunks
   → verdict                          "search missed", "replaced", or "grounded"
```

`search missed` means no chunk cleared the cutoff, and the model was not called.
`replaced` means chunks were kept and the answer was swapped for the refusal. `grounded`
means the answer was left as the model wrote it. The source list on a replaced answer
stays.

## How we implemented it

This module does not import RAG. `backend/src/modules/index.js` passes `ragService.ask`.
The check also writes the usual RAG trace.

| File | What it does |
| --- | --- |
| `service.js` | Calls ask, drops chunk text from the response, and names the verdict. |
| `router.js` | `POST /check`. Reads `X-User-Id`. |
| `index.js` | Module id `hallucination`. Health reports `check: "grounding"`. |

### Frontend (`frontend/src/modules/hallucination/HallucinationPage.jsx`)

A question box and **Check**. The card shows the verdict, the answer text, and the kept
file names and scores.

## API

`POST /api/hallucination/check`

```json
{ "question": "Who is the CEO of the company?" }
```

```json
{
  "verdict": "grounded",
  "answer": "The company gym is on the 3rd floor.",
  "sources": [{ "source": "knowledge.txt", "score": "0.774" }]
}
```

A blank question is HTTP 400. An unknown `X-User-Id` is HTTP 400. `verdict` is
`search missed`, `replaced`, or `grounded`.

## Test plan

### Automated tests

Run from `backend/`:

```bash
npm test
```

| File | What it checks |
| --- | --- |
| `tests/modules/evaluation/quality.test.js` | A refused answer with sources is `replaced`, and the chunk text is not returned. An empty source list is `search missed`. A supported answer is `grounded`. A blank question is HTTP 400. |

The test uses a fake ask. It does not call Ollama.

### Manual tests

The full lab, in order, is in [docs/test-plan.md](../../../../docs/test-plan.md).

| Step | Expected result |
| --- | --- |
| Check `What is the capital of Brazil?` | Verdict `search missed`. Kept is none. The model is not called |
| Check `Where is the company gym?` | Verdict `grounded` or `replaced`. If it is replaced, a `knowledge.txt` source is still listed |

## Known limitations

- **The check is a word check.** It looks for names and codes. A paraphrase without a new name passes. A name written in the file, including one a document orders the model to say, is treated as supported.
- **There is no second model judging the answer.** That judge is not built.
