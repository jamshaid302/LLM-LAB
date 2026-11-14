# Conversations module

**Status:** ready · **UI:** sidebar → Chat & Memory → Conversations · **API prefix:** `/api/conversations`

## What this module is about

A chat that forgets everything on refresh is not a conversation. This module writes
each thread and each message to MongoDB, then copies the recent turns into the next
prompt so the model can continue from what was already said.

Retrieval still runs. If the new question matches a knowledge-base chunk, that chunk is
added to the same prompt. The transcript and the documents stay in different databases.
`docs/learning-guide.md` answers what RAG is, how it works, how to learn it, what an LLM
is, and which ideas sit behind generative AI. When the retrieved chunk is that lesson,
the reply is the lesson itself, including the lab page to open. Other questions still
go to the model, which is told not to add a step the documents do not state.

**What you learn here:** why a chat transcript is not a vector search, how to put the
saved turns back into the next model call, and where a context window forces you to
stop sending the whole history.

## Why MongoDB and Chroma

Chroma and MongoDB are both persistent. They do not do the same job. Chroma and MongoDB store different things. Chroma holds the knowledge-base chunks so a question can find the nearest text. MongoDB holds the chat itself: which thread, who said what, and in what order.

|                                             | Chroma                                                               | MongoDB                                                                             |
| ------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| What is stored                              | Embeddings of `knowledge.txt`, plus the chunk text and the file name | Threads and messages: user id, role, text, time, and whether Stop cut the reply off |
| The question it answers                     | Which paragraph is closest to this question?                         | What did we already say, in order?                                                  |
| How a row is found                          | Compare vectors. A score near 1 is a close meaning.                  | Look up a thread id and sort messages by time                                       |
| What breaks if you use it for the other job | "Message 1, then 2, then 3" is not a similarity search               | "Which paragraph is about the gym?" is not a lookup by id                           |

The next prompt uses both on purpose:

- MongoDB supplies the transcript. "What is my name?" works because an earlier message
  said the name.
- Chroma supplies facts the transcript never stated. "Where is the gym?" still comes
  from `knowledge.txt` when nobody has said it yet.

Putting old replies into the same Chroma collection as the knowledge base would let a
past message compete with the gym chunk. Keeping the transcript only in Chroma would
lose a reliable order. MongoDB is the record. Chroma is the index over the documents.
Embedding old chats into their own collection, so you can search "what did we decide
last week?", can sit on top of MongoDB later. It does not replace it.

## How it works

```
New chat
   → POST /api/conversations/threads
   → MongoDB threads          one document, userId from the signed-in account, title "New chat"

Send
   → save the user message
   → if the thread is longer than the last 12 messages, summarize the older ones
   → if this is a follow-up, rewrite it into one standalone search query
   → retrieve chunks with that query (nearest 20, cross-encoder to the top 3) and drop any below the cutoff
   → copy the summary plus the original recent messages into the prompt
   → prompt                  system rules, then untrusted documents in their own message, then the transcript
   → Ollama stream           token events over SSE
   → save the assistant message, including a partial one if Stop was pressed
```

The first user message replaces the title "New chat". A refresh calls `GET /threads`
and `GET /threads/:id/messages`, so the page is rebuilt from MongoDB.

Only the last 12 messages are copied in full. When a thread grows past that, the older
messages are sent to the model once, and the paragraph it writes is saved on the thread
as `summary`. The next prompt gets that paragraph plus the recent turns. The original
messages stay in the `messages` collection. A later overflow summarizes the new older
turns together with the previous summary, so the early facts are not folded twice.

## How we implemented it

### Backend (`backend/src/modules/conversations/`)

| File              | What it does                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `mongo-store.js`  | The `threads` and `messages` collections. Connects with `MONGO_URL`, default `mongodb://127.0.0.1:27018/lab`.                               |
| `memory-store.js` | The same methods in process memory. Tests use it, so the suite does not need MongoDB.                                                       |
| `prompt.js`       | Builds the next message list from saved turns and any retrieved chunks. Trims to the history limit and starts the window on a user message. Also builds the follow-up search rewrite. |
| `service.js`      | Creates threads, saves both sides of a turn, rewrites a follow-up for search, retrieves context, and streams the reply.                     |
| `router.js`       | `GET/POST /threads`, `GET /threads/:id/messages`, `POST /threads/:id/stream`.                                                               |
| `index.js`        | Connects on startup. Health reports whether the store is up.                                                                                |

`backend/src/modules/index.js` is the only file that connects this module to RAG. It
passes a `retrieveContext` function. The conversations folder does not import the RAG
folder.

Threads and messages belong to the signed-in account. `userId` ownership is enforced at both the service layer and inside every `mongo-store.js` and `memory-store.js` query (`threads` and `messages` collections both store and filter by `userId`), so one account cannot list, read, summarize, or resume another's thread by ID.

### Frontend (`frontend/src/modules/conversations/ConversationsPage.jsx`)

A thread list, a transcript, and Send / Stop. Stop aborts the stream the same way
Streaming Chat does. The partial reply is still saved.

### Design decisions

**Two collections, not one embedded chat log.** A thread document and a messages
collection keep order and let a thread be listed without loading every token.

**History is replayed as messages, not as a retrieved chunk.** The model sees the
actual user and assistant turns. Documents are a separate system section.

**A summary, then the last 12 messages.** The summary is one extra model call, so it
costs tokens. `CONVERSATION_HISTORY_LIMIT` changes how many raw messages stay beside it.

**A follow-up is a bad search string.** "What is the password?" does not mention wifi.
A second model call rewrites it into a standalone query, and that query is what Chroma
sees. The reply prompt still contains the words the user typed. The first message in a
thread is searched as written. A blank or very long rewrite is ignored.

## API

`POST /api/conversations/threads` creates an empty thread and returns
`{ "id", "title", "createdAt", "updatedAt" }`.

`GET /api/conversations/threads` returns `{ "threads": [ ... ] }`, newest first.

`GET /api/conversations/threads/:id/messages` returns the full transcript plus
`summary` and `summarizedCount`, in time order. The summary is empty until the thread
outgrows the limit. An unknown id is 404.

`POST /api/conversations/threads/:id/stream`

```json
{ "message": "My name is Sam." }
```

The response is Server-Sent Events: `meta` (the summary, if one exists, the search
query, and any knowledge-base chunks that cleared the cutoff), then `token`, then
`done`. A missing message is JSON 400 before the stream opens.

## Test plan

### Automated tests

Run from `backend/`:

```bash
npm test
```

None of these need MongoDB or Ollama.

| File                                                | What it checks                                                                                                                                                                                                                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tests/modules/conversations/conversations.test.js` | The history window starts on a user message. The prompt contains both the saved transcript and a retrieved chunk. A second reply is prompted with the first saved answer. A follow-up is searched with the rewritten query, and the original sentence stays in the transcript. Past the limit, older messages are summarized once and left out of the next transcript. A later overflow folds new turns into the existing summary and does not repeat the original lines. A stopped stream saves the partial text. An unknown thread is 404 and an empty message is 400. Store-level, service-level, route-level, and session-auth isolation block reading or resuming another user's thread by ID. |
| `tests/live/mongo-conversations.live.test.js` (`npm run test:live`) | Against the real MongoDB: threads, messages, and rolling summaries are scoped by `userId` in database queries, cross-tenant operations are rejected, and legacy messages without `userId` are backfilled on startup. |

### Manual tests

The full lab, in order, is in [docs/test-plan.md](../../../../docs/test-plan.md). The rows below are this module.

From `backend/`, start MongoDB if it is not already up:

```bash
docker compose up -d
```

Start the API and the frontend. Open **Conversations**.

| Step                                       | Expected result                                                                  |
| ------------------------------------------ | -------------------------------------------------------------------------------- |
| Click **New chat**, send "My name is Sam." | A reply streams in. The thread title becomes that sentence                       |
| Send "What is my name?"                    | The reply uses Sam. No document is required                                      |
| Send "Tell me about the visitor wifi." then "What is the password?" | The second reply says lantern-42. A line says **Searched:** and names the wifi. The source is `office.txt`. The transcript still shows "What is the password?" |
| Send "Where is the company gym?"           | The reply says 3rd floor, and a `knowledge.txt` source is listed                 |
| Set `CONVERSATION_HISTORY_LIMIT=2`, restart, and send a third message | A card titled **Earlier messages summarized** appears. The first messages are still listed. A question about the first fact still works |
| Refresh the page                           | The same thread and both answers are still there                                 |
| Log out, log in as Guest, click **New chat**, then log in as Local | Guest's thread is absent from Local's list. Log in as Guest and it is there again |
| Press **Stop** during a long reply         | The partial text stays, with a Stopped line, and it is still there after refresh |
| Stop the API and start it again            | The log says `connected, N threads`. The chat is still there                     |

## Known limitations

- **Threads belong to the signed-in account.** Local and Guest are two accounts with the same powers, so you can prove the split. Guest's list does not include Local's threads, and opening someone else's thread returns 404. Passwords are `local` and `guest` until you change them. A new account works the same way. See [Accounts: Local and Guest](../../../../README.md#accounts-local-and-guest).
- **The search rewrite is another model call.** A follow-up costs one extra completion before retrieval. `llama3.2:1b` sometimes puts the answer inside the query. The original sentence is still what the reply sees.
- **The summary can drop a detail.** It is a model paragraph, not a lossless copy. The
  full messages are still in MongoDB if you need to check. `llama3.2:1b` often drops
  the fact or adds one that was never said. A larger local model keeps it.
- **Saved chats are not embedded.** You cannot yet search old threads by meaning.
  MongoDB is the transcript. A separate Chroma collection could index it later.
- **The RAG and Streaming Chat pages do not write threads.** Persistence lives on
  Conversations. Those other pages are still one-off replies.

## Experiments

1. Set `CONVERSATION_HISTORY_LIMIT=2` in `backend/.env`, restart, and send three messages.
   The summary card should appear, and a question about the first message should still
   have an answer. Put the limit back to 12 afterward.
2. Ask for something neither the transcript nor `knowledge.txt` contains. The reply
   should say it does not know.
