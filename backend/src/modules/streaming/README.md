# Streaming Chat module

**Status:** ready · **UI:** sidebar → Chat & Memory → Streaming Chat · **API prefix:** `/api/streaming`

## What this module is about

A normal request waits until the model has finished the whole answer, then sends it in
one JSON body. That pause is the entire generation. Streaming sends each token as it
is chosen, so the page can show the answer while it is still being written.

**Server-Sent Events (SSE)** is the mechanism. The HTTP response stays open. The server
writes small text frames. The browser reads them as they arrive. It is one-way: the
server talks, the client listens. Cancelling is just closing that connection.

**What you learn here:** why a chat UI should not wait for the full completion, how an
Ollama token stream becomes SSE, and how Stop aborts the model call without throwing
away the tokens already on screen.

## How it works

```
Send
   → POST /api/streaming/chat     { "message": "..." }
   → validate                     missing or oversized messages are a JSON 400
   → Ollama /api/chat             stream: true, one JSON object per line
   → SSE                          event: token, then event: done
   → Stop                         the browser aborts the fetch, the server aborts Ollama
```

The RAG page uses the same frames after retrieval. Its route is `POST /api/rag/stream`.
A `meta` event arrives first, with the kept and dropped chunks. Then the tokens.

## How we implemented it

### Backend

| File | What it does |
| --- | --- |
| `core/ollama-stream.js` | Reads Ollama's line-delimited chat stream and hands each token to a callback. The fetch function is injected, so tests never open a socket. |
| `core/sse.js` | Writes one SSE frame, parses frames back apart, and aborts the model call when the response actually closes. |
| `service.js` | Checks the message, then writes `token` and `done`. |
| `router.js` | `POST /chat`. A bad message is JSON 400 before the stream opens. A model failure after that is an `error` event. |
| `index.js` | The module definition. Health reports the chat model name. |

The RAG module calls the same Ollama reader from `rag-service.js`. The two modules do
not import each other.

### Frontend (`frontend/src/modules/streaming/StreamingPage.jsx`)

A chat box. Send starts the stream and appends tokens onto the latest reply. Stop
aborts the fetch. `frontend/src/lib/sse.js` turns the byte stream into events. The RAG
page uses that same reader.

### Design decisions

**SSE, and the response stays a POST.** The message is a JSON body, so it stays out of
the URL. The response content type is `text/event-stream`.

**Cancel is an aborted fetch.** The server listens for the response closing and aborts
the Ollama request with that signal. The listener is removed before a normal finish,
so a completed answer is not reported as a cancel.

## API

`POST /api/streaming/chat`

```json
{ "message": "Count from 1 to 5." }
```

The body of a successful response looks like this:

```
event: token
data: {"text":"1"}

event: token
data: {"text":"\n2"}

event: done
data: {"finish":"stop"}
```

A missing message is HTTP 400, `{ "error": "Missing 'message'" }`, and the stream is
never opened. After the stream has started, a failure is `event: error`.

## Test plan

### Automated tests

Run from `backend/`:

```bash
npm test
```

None of these need Ollama.

| File | What it checks |
| --- | --- |
| `tests/core/ollama-stream.test.js` | A half-finished line is kept until the next chunk. Tokens are read in order. Aborting stops the reader after the token already emitted. SSE frames parse back into the same event. |
| `tests/modules/streaming/stream.test.js` | `/chat` writes token events and then done. A missing message is a JSON 400 and never calls the model. A thrown model error becomes an error event. |
| `tests/modules/rag/rag-service.test.js` | A grounded answer streams tokens after the source list. A score below the cutoff streams the refusal and does not call the model. |

### Manual tests

The full lab, in order, is in [docs/test-plan.md](../../../../docs/test-plan.md). The rows below are this module.

Start the backend and frontend, open **Streaming Chat**, and check each row.

| Step | Expected result |
| --- | --- |
| Send "Count from 1 to 10." | Numbers appear one after another, before the reply is finished |
| Press **Stop** during that reply | The numbers already shown stay. A Stopped line appears. Nothing more arrives |
| Send an empty message | The button does nothing |
| Open **RAG** and ask "Where is the company gym?" | The source lines show up, then the answer grows token by token |
| Press **Stop** on a RAG answer | The partial sentence stays, with its sources if they already arrived |

## Known limitations

- **Nothing is stored.** A refresh clears the page. Threads in MongoDB are the next slice.
- **One reply at a time.** Sending again is blocked until the current stream ends or is stopped.
- **The plain chat has no documents.** Grounded answers stay on the RAG page.

## Experiments

1. Ask for a long explanation and press Stop halfway. Compare the partial text with what
   a full answer would have been.
2. Stop Ollama and send a message. The page should show an error, not spin forever.
