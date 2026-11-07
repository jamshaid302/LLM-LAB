# Providers and cost module

**Status:** ready · **UI:** sidebar → Foundations → Providers & Cost · **API prefix:** `/api/providers`

## What this module is about

A chat app that calls one vendor's SDK directly has to be rewritten for the next vendor.
This module puts one chat function in front of the model. The request names which model
to use. The reply comes back with how many tokens were read, how many were written, how
long it took, and what that call cost.

Both models here are local Ollama models, so the cost is $0. The same token counts are
multiplied by a sample hosted rate so the bill is visible before any paid API exists.

**What you learn here:** why the rest of the app should not know which vendor it called,
how a price is tokens times a rate, and why a local model still deserves a usage record.

## How it works

```
Run
   → POST /api/providers/complete     { "model", "prompt" }
   → reject an unknown model or an empty prompt
   → Ollama /api/chat                 stream: false, the same function summaries use
   → read prompt_eval_count and eval_count
   → cost = tokens / 1,000,000 × rate
   → save the record and return it with the reply
```

`llama3.2:1b` and `qwen2.5:7b` both have a rate of $0 per million tokens. A sample hosted
rate of $0.15 in and $0.60 out is applied to the same counts and labeled as not billed.

## How we implemented it

### Backend

| File | What it does |
| --- | --- |
| `core/ollama-stream.js` | `completeOllamaChatResult` is the one non-streaming chat call. It returns the text and Ollama's token counts. `completeOllamaChat` returns the text alone, which conversation summaries still use. |
| `pricing.js` | The model catalog and `quote`. A missing token count produces no price. |
| `usage-log.js` | Keeps the latest 50 calls in memory. |
| `service.js` | Checks the prompt and the model, times the call, quotes the local price and the hosted example, and stores the record. |
| `router.js` | `GET /models`, `GET /usage`, `POST /complete`. |
| `index.js` | The module definition. Health reports `ollama` and how many models are listed. |

### Frontend (`frontend/src/modules/providers/ProvidersPage.jsx`)

A model menu, a prompt, and a Run button. The card under the reply shows prompt tokens,
completion tokens, latency, and cost. A second line shows the sample hosted price. The
list below is the in-memory log.

### Design decisions

**One function, two return shapes.** Summaries only need the text. This page needs the
token counts. Both go through `completeOllamaChatResult`.

**The hosted number is an example.** There is no second vendor and no API key. The
multiplication is real. The charge is not.

## API

`GET /api/providers/models` returns the two local models, their $0 rates, which one is
the default chat model, and `hostedExample`.

`GET /api/providers/usage` returns `{ "calls": [ ... ] }`, newest first.

`POST /api/providers/complete`

```json
{ "model": "llama3.2:1b", "prompt": "Reply with the single word pong." }
```

A successful body includes `text`, `promptTokens`, `completionTokens`, `latencyMs`,
`costUsd`, and `hostedExampleUsd`. An empty prompt or a model that is not in the catalog
is HTTP 400, and the model is not called.

## Test plan

### Automated tests

Run from `backend/`:

```bash
npm test
```

None of these need Ollama.

| File | What it checks |
| --- | --- |
| `tests/modules/providers/providers.test.js` | A zero rate quotes $0. A million prompt tokens at $0.15 and half a million completion tokens at $0.60 quote $0.45. Missing counts quote nothing. A completion records tokens, latency, a $0 cost, and the hosted example, and an unknown model or a blank prompt never calls the model. |
| `tests/core/ollama-stream.test.js` | The shared chat call returns the text, and the detailed result keeps the token counts. |

### Manual tests

The full lab, in order, is in [docs/test-plan.md](../../../../docs/test-plan.md). The rows below are this module.

Start the API and the frontend. Open **Providers & Cost**.

| Step | Expected result |
| --- | --- |
| Open the page | Both local models are in the menu. The default matches the model in the health badge |
| Run the default prompt on Llama 3.2 1B | The reply appears. Prompt tokens, completion tokens, and latency are filled in. Cost is $0.00. The hosted line is a fraction of a cent and says the call was not billed |
| Run the same prompt on Qwen 2.5 7B | A second row appears. Its cost is also $0.00. The first row is still listed |
| Refresh the page | The recent-calls list is empty. The log is memory only |

## Known limitations

- **Only Ollama.** There is no hosted adapter, no fallback when a call fails, and no cache. The way to add a paid provider later, including the tests, is in [docs/later-modules.md](../../../../docs/later-modules.md#hosted-provider).
- **The log forgets on restart.** It is not in MongoDB.
- **Other pages do not all write this log.** Fundamentals, RAG, streaming, and conversations still call Ollama on their own routes. Summaries share the chat function, and this page is the one that records the price.
- **Embeddings are not priced.** This record is for chat calls.

## Experiments

1. Run the same prompt on both models and compare latency and token counts.
2. Change a rate in `pricing.js` from 0 to 3 and restart. The cost line should move off $0.00. Put it back afterward.
