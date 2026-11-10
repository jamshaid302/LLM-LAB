# LLM evaluation module

**Status:** ready · **UI:** sidebar → Quality → LLM Evaluation · **API prefix:** `/api/evaluation`

## What this module is about

A RAG system can fail in two places. Retrieval can miss the chunk that holds the answer,
or the model can get the answer wrong from the right chunk. This module measures both.

- **Retrieval** runs on the page: was the right chunk in the top k, and how high?
- **Answer quality** runs from the command line, because it calls the chat model 57 times
  and the judge 49 times. The saved result shows on the page.

**What you learn here:** recall@k and MRR, measured before and after the cutoff; grading
an answer by a human label and by an LLM judge; and why the judge is only trusted as far
as it agrees with the labels.

## How it works

```
Score question set (page)
   → POST /api/evaluation/run
   → eval/questions.json: 49 answerable (8 need two facts) and 8 unanswerable
   → embed each question, take the 20 nearest, rerank, keep k, apply RAG_MIN_SCORE
   → recall@k, MRR, and one row per question

Saved baseline (page)
   → GET /api/evaluation/baseline
   → eval/baseline.json as committed: retrieval, the reranker comparison, and one
     answer run per chat model

npm run eval:answers -- --model qwen2.5:7b --write (command line)
   → every question through the real ask path: retrieval, reranker, prompt, model,
     grounding check, redaction
   → answerable: correct by label? (every labelled fact appears in the answer)
                 correct by judge? (a second model call answers yes or no)
                 do they agree?
   → unanswerable: refused? by the cutoff, or by the model and grounding check?
   → saved under answers.<model> in eval/baseline.json
```

A two-fact question counts as found only when both facts are in the top k. Its MRR uses
the rank where the second fact first appears. An answerable question that gets "I don't
know" is a false refusal. An unanswerable question passes only on a refusal.

The signed-in account limits the search to the shared samples plus that person's files.
The golden questions are about the shared samples.

## How we implemented it

This module does not import RAG. `backend/src/modules/index.js` passes
`ragService.evaluate` and a function that reads `eval/baseline.json`.

| File | What it does |
| --- | --- |
| `service.js` | Runs the injected scorer. Returns the saved baseline, or HTTP 404 when none is wired. |
| `router.js` | `POST /run`, `GET /baseline`. |
| `index.js` | Module id `evaluation`. Health reports `kind: "retrieval"` and whether a baseline is wired. |
| `../rag/eval/report.js` | Shapes retrieval and answer results for the baseline and finds drops. |
| `../rag/eval/gate.js` | The floors the committed baseline must meet. |
| `../../../scripts/eval-answers.mjs` | The answer-quality run. |

### Frontend (`frontend/src/modules/evaluation/EvaluationPage.jsx`)

**Score question set** shows recall, MRR, and a row per question: found, missed, refused,
or not refused, with the top score and a "needs two chunks" tag. Below it, **Saved
baseline** shows the committed numbers: the question counts, retrieval, the reranker
comparison, and for each chat model the label and judge scores, the judge's agreement,
false refusals, and which unanswerable questions were answered anyway.

### Design decisions

**Labels first, judge second.** The label check is strict and dumb: the labelled fact
must appear in the answer. It misses a correct answer that is worded differently ("16
weeks" against "sixteen weeks"). The judge reads meaning, but it is a model and can be
wrong in either direction. Recording both, and the rate they agree, shows how far the
judge can be trusted before anyone relies on it for questions with no label.

**The same model judges by default.** `--judge-model` picks another. A model grading its
own answers is the cheapest setup and the most likely to be lenient. That is a reason to
read the agreement rate, not to skip the judge.

**A gate on saved numbers.** CI has no Ollama, so it cannot rerun the models. Instead,
`tests/modules/rag/gate.test.js` checks the committed `baseline.json` against floors in
`gate.js`. Someone who changes retrieval or the prompt has to run the scripts with
`--write` and commit numbers that still clear the floors.

## What the measurement said

Measured 29 October 2026, `nomic-embed-text`, cross-encoder on, k of 3, cutoff 0.5.

Retrieval on the 49 answerable questions: recall@3 1.0 and MRR 0.915 after the cutoff.
The cutoff alone refused 2 of the 8 unanswerable questions (Brazil and the 2018 World
Cup).

Answers from `qwen2.5:7b`, judged by `qwen2.5:7b` at temperature 0. All 57 questions were
asked on 29 October 2026 (22 minutes, 23 seconds per question on average). One label was
corrected the next day and that saved answer was graded again; the other 56 answers were
not re-asked.

| Measure | Result |
| --- | --- |
| Correct by human label | 49 of 49 (1.0) |
| Correct by LLM judge | 49 of 49 (1.0) |
| Judge agrees with label | 1.0 |
| Answerable questions wrongly refused | 0 |
| Unanswerable questions refused | 8 of 8: 2 by the cutoff, 6 by the model or grounding check |

The first save of this run was 48 of 49 by the judge. The miss was "What is a
cross-encoder?". The answer was right ("reads the question and one chunk together"), but
the label was the single word `together`. Shown "Fact: together", the judge said no. The
label is now the full phrase the glossary uses, and the same saved answer was graded
again: the judge said yes. A label has to be a fact a reader can check, not a keyword.

The cutoff stops only 2 of the unanswerable questions, so the 6 that reach the model are
where the prompt and the grounding check earn their place. All 6 were refused. An earlier
run before the citation fix had 2 false refusals on answerable questions, both caused by
the grounding check reading `[1]` as a number.

## API

`POST /api/evaluation/run` takes no body. The JSON is the retrieval report: `k`,
`minScore`, `recallAtK`, `mrr`, `refusedByCutoff`, `reranked`, `details`, and
`unanswerableDetails`. An unknown `X-User-Id` is HTTP 400 when the route is called with
no session.

`GET /api/evaluation/baseline` returns `eval/baseline.json` as committed. It calls no
model.

## Test plan

### Automated tests

Run from `backend/`:

```bash
npm test
```

| File | What it checks |
| --- | --- |
| `tests/modules/evaluation/quality.test.js` | The route returns the retrieval report. The baseline route serves the saved file without calling a model and is 404 when none is wired. An unknown user is HTTP 400. |
| `tests/modules/rag/eval-report.test.js` | Label and judge rates, agreement, false refusals, refusals split into cutoff and model, and drop detection. |
| `tests/modules/rag/gate.test.js` | The committed baseline clears every floor; each kind of drop fails with a named reason. |
| `tests/modules/hallucination/judge.test.js` | The judge prompt lists every fact of a two-fact label, and a two-fact answer needs both. |

These tests do not call Ollama.

### Manual tests

The full lab, in order, is in [docs/test-plan.md](../../../../docs/test-plan.md).

| Step | Expected result |
| --- | --- |
| Click **Score question set** | Recall@3 is 100% before and after. MRR after is about 0.92. Unanswerable refused is 2/8. Two-fact questions carry the "needs two chunks" tag |
| Read **Saved baseline** | The same retrieval numbers, the reranker comparison, and an answer run for qwen2.5:7b |
| Run `npm run eval:answers -- --model qwen2.5:7b --limit 5` from `backend/` | Five `ok judge=yes` lines and five unanswerable lines. It does not save, and exits 0 unless a score fell |

## Known limitations

- **The answer run is slow.** 22 minutes for qwen2.5:7b on this machine, and longer when
  something else is using the CPU, so it is not in CI. CI checks the committed result instead.
- **Only one model is saved.** `llama3.2:1b` has not had a full run. `--model llama3.2:1b --write`
  adds it beside qwen2.5:7b on the page; the gate only checks qwen2.5:7b.
- **A label is a substring.** A correct answer in other words fails the label and should
  pass the judge. Those disagreements are listed in the saved rows.
- **No claim-level faithfulness score.** The judge says yes or no for the whole answer.
  Splitting an answer into claims and checking each against the chunks (the RAGAS-style
  faithfulness metric) is planned; see [docs/concepts.md](../../../../docs/concepts.md).
- **The question file is the one in the RAG module.** Adding a question means editing that file.
