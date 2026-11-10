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

```
Judge
   → POST /api/hallucination/judge    { "question" }   (only questions in eval/questions.json)
   → the human label for that question: one fact, or two for a two-chunk question
   → RAG ask                          the real answer
   → label check                      every fact appears in the answer, ignoring case
   → judge prompt                     a second model call: "does the answer include every one of those facts?" yes or no
   → agree                            whether the model and the label said the same thing
```

The grounding check asks "is this supported by the chunks?". The judge asks "is this the
right answer?". An answer can pass the first and fail the second: supported by a chunk,
but the wrong chunk. `npm run eval:answers` runs the judge over the whole question set and
saves the result; see [Evaluation](../evaluation/README.md).

## How we implemented it

This module does not import RAG. `backend/src/modules/index.js` passes `ragService.ask`.
The check also writes the usual RAG trace.

| File | What it does |
| --- | --- |
| `service.js` | Calls ask, drops chunk text from the response, and names the verdict. The judge reads the label, asks, prompts the judge model, and compares. `labelFacts`, `answerHasFacts`, and `judgePrompt` are exported for the answer-quality script. |
| `router.js` | `POST /check`, `POST /judge`. |
| `index.js` | Module id `hallucination`. Health reports `check: "grounding"`. |

### Frontend (`frontend/src/modules/hallucination/HallucinationPage.jsx`)

A question box and **Check**. The card shows the verdict, the answer text, and the kept
file names and scores. The check searches as the signed-in account. Local and Guest both see the shared samples and do not see each other's uploads.

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

`POST /api/hallucination/judge` takes the same body and returns
`{ "expect", "answer", "modelSays", "labelSays", "agree" }`. `expect` lists the labelled
facts, joined by commas. A question with no label is HTTP 400.

## Test plan

### Automated tests

Run from `backend/`:

```bash
npm test
```

| File | What it checks |
| --- | --- |
| `tests/modules/evaluation/quality.test.js` | A refused answer with sources is `replaced`, and the chunk text is not returned. An empty source list is `search missed`. A supported answer is `grounded`. A blank question is HTTP 400. |

| `tests/modules/hallucination/judge.test.js` | Agreement when model and label both see the fact; disagreement when the model says it is missing; a two-fact label needs both facts in the answer; a question with no label is HTTP 400. |
| `tests/modules/rag/grounding.test.js` | The grounding check, including `[1]` not counted as a number. |

The tests use a fake ask and a fake model. They do not call Ollama.

### Manual tests

The full lab, in order, is in [docs/test-plan.md](../../../../docs/test-plan.md).

| Step | Expected result |
| --- | --- |
| Check `What is the capital of Brazil?` | Verdict `search missed`. Kept is none. The model is not called |
| Check `Where is the company gym?` | Verdict `grounded`, with a `knowledge.txt` source |
| Check `Who is the CEO of the company?` | A source clears the cutoff, so the model is called. Verdict `replaced` or a refusal from the model; no invented name |
| Judge `How many vacation days and how many paid sick days do employees get?` | The label is `25, 10`. With qwen2.5:7b both the label check and the judge say yes, and agree is true |

## Known limitations

- **The check is a word check.** It looks for names and codes. A paraphrase without a new name passes. A name written in the file, including one a document orders the model to say, is treated as supported.
- **The citation bug it once had.** Until 29 October 2026 the check read `[1]` as the number 1 and refused correct answers whose chunk had no "1" in it. The full answer run found it as two false refusals; `grounding.js` now ignores citation markers.
- **The judge is a model.** It can be lenient, especially when it grades its own answers. Read its agreement with the labels on the Evaluation page before trusting it on questions with no label.
