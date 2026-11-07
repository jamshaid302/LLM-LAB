# Observability module

**Status:** ready · **UI:** sidebar → Production → Observability · **API prefix:** `/api/observability`

## What this module is about

When an answer is wrong, the next question is whether the search missed or the model
ignored a good chunk. One trace per RAG or chat request records the times, the token
counts, and the chunk names. It does not record the question or the chunk text.

**What you learn here:** those fields are enough to separate a retrieval failure from a
generation failure. A new monitoring product is not required for that.

## How it works

```
RAG ask or stream, Streaming Chat, or a Conversations reply
   → time the search, when there is one
   → time the model call
   → read prompt tokens and completion tokens when Ollama sends them
   → keep source names and scores for the chunks that were kept and dropped
   → GET /api/observability/traces     newest first, last 50, in memory
```

A trace with no kept chunks and `refused: true` means the search missed and the model
was not called. Kept chunks plus `refused: true` means the model answered and the
grounding check replaced that answer. Streaming Chat has no retrieval time.

The Providers page still has its own usage list for the two local models. This list is
the request trace. A restart clears both.

## How we implemented it

RAG, Streaming Chat, and Conversations do not import this module. `backend/src/modules/index.js`
passes one `record` function into each of them, and passes the same log to this module.

| File | What it does |
| --- | --- |
| `trace-log.js` | Keeps the newest 50 traces. Copies source and score, and drops any other field on a hit. |
| `router.js` | `GET /traces`. |
| `index.js` | Module id `observability`. Health reports how many traces are in memory. |

`completeOllamaChatResult` and the end of `streamOllamaChat` supply the token counts.
A stopped stream still leaves a trace.

### Frontend (`frontend/src/modules/observability/ObservabilityPage.jsx`)

The list loads on open. **Refresh** loads it again. Each card shows the route, the
person, retrieval time, generation time, token counts, and the kept file names.

## API

`GET /api/observability/traces` returns `{ "traces": [ ... ] }`.

Each trace has `id`, `createdAt`, `route`, `userId`, `retrievalMs`, `generationMs`,
`promptTokens`, `completionTokens`, `refused`, `sources`, `dropped`, and `error`.
`sources` and `dropped` are `{ "source", "score" }` only. `route` is `rag.ask`,
`rag.stream`, `streaming.chat`, or `conversations.reply`.

## Test plan

### Automated tests

Run from `backend/`:

```bash
npm test
```

| File | What it checks |
| --- | --- |
| `tests/modules/observability/traces.test.js` | The newest trace is first. A source keeps the file name and score, and the chunk text is not stored. A RAG ask under the cutoff is `refused` with no generation time and does not call the model. A streaming chat records the token counts the fake stream returns. |

These tests do not call Ollama.

### Manual tests

The full lab, in order, is in [docs/test-plan.md](../../../../docs/test-plan.md). The rows below are this module.

Start the API and the frontend. Open **RAG** and ask one question, then open **Observability** and click **Refresh**.

| Step | Expected result |
| --- | --- |
| Ask `Where is the company gym?` on RAG, then refresh here | A `rag.stream` card says `answered`. Retrieval and generation times are filled in. Kept names `knowledge.txt`. Token counts are numbers |
| Ask `What is the capital of Brazil?` on RAG, then refresh | A card says `search missed`. Kept is `none`. Generation is `—` |
| Send one message on **Streaming Chat**, then refresh | A `streaming.chat` card. Retrieval is `—`. Generation is a number |

## Known limitations

- **The log is memory.** A restart clears it. It is not in MongoDB.
- **Fundamentals and the Providers run button do not write this log.** They have their own result cards. Summaries and the search rewrite inside Conversations are separate model calls and are not their own traces. The reply is.
- **The trace does not include the question.** That keeps a customer sentence out of the log. The route, the person, and the file names are what you use to find the request.
