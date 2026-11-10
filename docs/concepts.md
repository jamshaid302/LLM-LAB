# Concept map: LLMs, generative AI, and RAG in this lab

This page is for people who are new to AI. It lists the concepts in the order they build on
each other. Each one says what it is, what this lab does with it, the code to read, and
the test that checks it. The same list is in the app as **Start Here → Learning Path**
(`frontend/src/modules/learn/concepts.js`). Change both when a concept changes status.

Status words:

- **built**: the lab runs it and a test checks it.
- **measured**: built and scored, but not used for answers because it did not win.
- **planned**: explained here and not built yet. The text says how I would build it.
- **left out**: deliberately not built in this lab.

Everything runs locally: Ollama for the models (`qwen2.5:7b`, `llama3.2:1b`,
`nomic-embed-text`), Chroma for vectors, MongoDB for accounts, threads, traces, and jobs.
No paid key is needed.

---

## 1. How a language model works

### Tokens (built)

A model reads and writes tokens, which are word pieces. In English one token is roughly
four characters, but that is only an estimate. Context limits and prices are counted in
tokens, not words.

In this project I show Ollama's real prompt and completion counts next to the
characters-divided-by-4 estimate, so the gap is visible.
Code: `backend/src/modules/fundamentals/complete.js`. Test: `tests/modules/fundamentals/complete.test.js`.
Try it: LLM Fundamentals → Run.

### Next-token sampling: temperature, top-p, seed (built)

The model gives every possible next token a probability. Temperature 0 always picks the
most likely token. A higher temperature flattens the odds. Top-p keeps only the smallest
set of tokens whose probabilities add up to p. A fixed seed makes the random choice
repeatable.

In this project I expose all three, plus max tokens, with Precise and Creative presets.
Code: `backend/src/modules/fundamentals/sampling.js`. Test: `tests/modules/fundamentals/sampling.test.js`.
Try it: run Precise twice (same answer), then Creative twice (different answers).

### Chat roles: system, user, assistant (built)

A chat call sends a list of messages. The system message holds the rules, the user
message holds the request, and assistant messages are earlier replies. The RAG prompt is
a system message with rules plus a user message that holds the documents and question.
Code: `backend/src/modules/rag/prompt.js`. Test: `tests/modules/rag/prompt.test.js`.

### Context window (built)

The context window is the most tokens a model can see in one call: rules, history,
documents, and the answer it is writing. Anything past that is cut off.

In this project I send only the last 12 messages of a thread (`CONVERSATION_HISTORY_LIMIT`)
and fold older ones into a summary, so a long chat does not overflow.
Code: `backend/src/modules/conversations/prompt.js`. Test: `tests/modules/conversations/conversations.test.js`.

### Model size and choice (built)

Bigger models follow instructions better and are slower. In this project I run the same
question set through both local models, so the trade-off is a number, not a feeling (see
section 5). One provider interface means the rest of the app does not know which model
it called.
Code: `backend/src/modules/providers/service.js`. Test: `tests/modules/providers/providers.test.js`.

### Embeddings (built)

An embedding model turns text into a vector (a list of numbers). Texts with similar
meaning get vectors that point in similar directions. Cosine similarity measures that:
1 is the same direction, 0 is unrelated.

In this project I use `nomic-embed-text` for every chunk and every question.
Code: `backend/src/modules/rag/store.js`, `backend/src/modules/semantic-search/service.js`.
Test: `tests/modules/rag/store.test.js`, `tests/modules/semantic-search/search.test.js`.

### Hallucination (built)

A hallucination is a confident answer that nothing supports. A model is trained to produce
likely text, not true text, so it fills gaps. See grounding in section 3 and the judge in
section 5 for how this lab catches it.

### Quantization (planned)

Quantization stores weights in fewer bits, for example 4-bit instead of 16-bit, so the
model needs less memory and runs faster, at some cost in quality. The Ollama models here
are already quantized builds. The way I would build the lesson is to run the same question
set against two quantization levels of one model and record answer quality, latency, and
memory side by side.

---

## 2. Prompting

### Zero-shot, role, few-shot, chain-of-thought (built)

These are four ways to ask for the same thing: the task alone, a role with a required
output shape, a couple of worked examples, or a request to reason before answering. In
this project I run all four with sampling held still, so only the wording changes.
Code: `backend/src/modules/fundamentals/prompts.js`. Test: `tests/modules/fundamentals/prompts.test.js`.

### Structured output (built)

Asking for JSON does not guarantee valid JSON. In this project I parse and validate the
reply, and on failure send the error back to the model once before giving up.
Code: `backend/src/modules/fundamentals/structured.js`. Test: `tests/modules/fundamentals/structured.test.js`.

### Prompt injection (built)

A document or message can contain text such as "ignore your instructions". In this
project I fence every retrieved chunk in `<document>` tags with an instruction that the
contents are data, not commands. I also remove those tags if a small model echoes them
into its answer.
Code: `backend/src/core/untrusted.js`. Test: `tests/core/untrusted.test.js`.

---

## 3. Retrieval-augmented generation (RAG)

### What RAG is, and what it is not (built)

RAG means searching your own documents for the passages that answer a question, then
giving those passages to the model with the question. The model answers from them and
cites them. It does not retrain the model, and in this lab it does not search the
internet. Web search would be a different, untrusted source (see the last item in this
section).

The request path in this project:

```text
question
  → embed the question
  → find the 20 closest chunks you are allowed to see
  → cross-encoder rescoring, keep the best 3
  → drop chunks under cosine 0.5; if none are left, refuse without calling the model
  → prompt: rules + fenced chunks + question
  → model answer with [1] style citations
  → grounding check: unsupported names or numbers turn the answer into a refusal
  → redact emails, phone numbers, ID numbers, card numbers, and keys
```

Code: `backend/src/modules/rag/rag-service.js`. Test: `tests/modules/rag/rag-service.test.js`.

### Chunking and overlap (built)

Documents are cut into pieces of about 400 characters with 50 characters of overlap. A
chunk has to be small enough to match one fact and large enough to make sense on its own.
The overlap keeps a sentence cut at a boundary whole in at least one piece.
Code: `backend/src/modules/rag/chunking.js`. Test: `tests/modules/rag/chunking.test.js`.

### Vector store (built)

The vector store keeps the embeddings and finds the nearest ones. In this project there
are two: memory (rebuilt on start, used by tests) and Chroma (kept between restarts).
Both take the same owner filter.
Code: `backend/src/modules/rag/store.js`. Test: `tests/modules/rag/store.test.js`,
`tests/live/chroma-owners.live.test.js` (against a real Chroma).

### Top-k and the similarity cutoff (built)

Top-k is how many chunks go into the prompt (3 here). The cutoff (0.5 cosine) drops weak
matches. When nothing passes, the system refuses without calling the model, which is
cheaper and cannot hallucinate. Measured on the question set: the cutoff alone refuses 2
of the 8 unanswerable questions, so the cutoff is not enough by itself.
Code: `backend/src/modules/rag/retrieval.js`. Test: `tests/modules/rag/retrieval.test.js`.

### Grounding and citations (built)

The prompt tells the model to answer only from the documents and cite them as [1], [2].
After the answer comes back, a check pulls out names and numbers and rejects the answer
if any is missing from the retrieved text. Citation markers such as `[1]` are not counted
as numbers. That was a real bug: it turned correct answers into refusals until the
question-set run exposed it.
Code: `backend/src/modules/rag/grounding.js`. Test: `tests/modules/rag/grounding.test.js`.

### Metadata filtering (built)

Each chunk records its owner: shared, or one account. Search filters before choosing the
top k, so another person's file cannot take a slot and then be hidden.
Code: `backend/src/modules/rag/store.js` (`ownerWhere`). Test: `tests/modules/rag/owners.test.js`,
`tests/live/chroma-owners.live.test.js`.

### Ingestion pipeline (built)

Upload checks the file at once: type, size, path, and PDF text. Embedding is a background
job that can fail and be retried from the file on disk. A separate worker process can run
the jobs from MongoDB.
Code: `backend/src/modules/rag/embed-queue.js`, `job-pump.js`, `pdf-text.js`.
Test: `tests/modules/documents/pipeline.test.js`, `tests/modules/rag/job-pump.test.js`,
`tests/live/mongo-jobs.live.test.js`.

### Hybrid search: BM25 plus vectors (measured)

BM25 is keyword ranking. It finds exact codes and rare words that embeddings blur. The
keyword list and the vector list are merged with reciprocal rank fusion (RRF, constant 60).
Measured: recall@3 rose from 0.959 to 0.98, but the cross-encoder did better, so RAG does
not use hybrid.
Code: `backend/src/modules/advanced-rag/hybrid.js`. Test: `tests/modules/advanced-rag/hybrid.test.js`.

### Reranking with a cross-encoder (built, used for answers)

Vector search is a bi-encoder: the question and the chunk are embedded separately, then
compared. A cross-encoder reads the question and the chunk together and outputs one
relevance score. That is more accurate and too slow to run on every chunk, so it rescores
only the 20 nearest.

In this project I run `Xenova/ms-marco-MiniLM-L-6-v2` (quantized ONNX, about 23 MB) on
the CPU through `onnxruntime-web`. It adds 1 to 1.5 seconds per question here. It downloads once into `backend/.cache/models`. If it
fails, retrieval falls back to vector order. The cosine score is still the one the cutoff
uses.

Measured on 49 answerable questions (2026-10-29):

| Retriever          | recall@3 | MRR   | Result                            |
| ------------------ | -------- | ----- | --------------------------------- |
| Vector only        | 0.959    | 0.884 | the old default                   |
| Hybrid (BM25+RRF)  | 0.98     | 0.895 | better, not best                  |
| Overlap rerank     | 0.898    | 0.796 | worse, removed from consideration |
| Cross-encoder      | 1.0      | 0.915 | best, now the default             |
| Parent document    | 0.98     | 0.959 | sends whole files, not adopted    |

Code: `backend/src/core/cross-encoder.js`. Test: `tests/core/cross-encoder.test.js` and
the "reranker in the ask path" tests in `tests/modules/rag/rag-service.test.js`.
Turn it off with `RAG_RERANK=off`.

### Parent-document retrieval (measured)

This approach searches small chunks and then sends the larger section they came from. It
had the best MRR here, but it sends whole files, which costs more tokens and gives the
model more to get wrong.
Code: `backend/src/modules/advanced-rag/expand.js`. Test: `tests/modules/advanced-rag/expand.test.js`.

### Query rewriting (built)

"When is it open?" means nothing to a search engine. In this project I rewrite a follow-up
into a standalone query using the thread before retrieving.
Code: `backend/src/modules/conversations/prompt.js`. Test: `tests/modules/conversations/conversations.test.js`.

### Semantic search without a chatbot (built)

Sometimes the product is the search results themselves. In this project I return the
chunks and scores, group near-duplicates, and show what fell under the cutoff.
Code: `backend/src/modules/semantic-search/`. Test: `tests/modules/semantic-search/search.test.js`,
`organize.test.js`.

### Answer caching (built)

An exact repeat of a question by the same person returns the saved answer from
`POST /api/rag/ask`. Any document change clears the cache. Streaming answers are not cached.
Code: `backend/src/modules/rag/answer-cache.js`. Test: `tests/modules/rag/answer-cache.test.js`.

### HyDE and multi-query expansion (planned)

HyDE has the model write a hypothetical answer and searches with that answer's embedding.
Multi-query writes several rephrasings and merges the results. The way I would build it
is as one more pass on Advanced RAG, scored on the same 49 questions, adopted only if it
beats the cross-encoder. Every question then costs one extra model call.

### Semantic cache (planned)

A semantic cache reuses an answer when a new question means the same thing as an old one.
The way I would build it is to embed the question, look up cached questions above a high
similarity (for example 0.95) for the same owner and corpus version, and measure how
often it returns a wrong answer on the question set before turning it on.

### Graph RAG (planned)

Graph RAG extracts entities and relations into a graph and retrieves along the links. It
helps with questions that connect many documents, such as "which policies mention the
same approval rule?". The way I would build it is to extract triples at ingest time into
MongoDB, then compare against the current retriever on multi-chunk questions only.

### Web search and real-time data (planned)

Searching the internet is a different source, not a feature of RAG itself. The way I
would build it is as an agent tool that needs a search API key. Results would be fenced
like uploaded files and labelled as web sources, because a web page is untrusted input.

---

## 4. Chat and memory

### Streaming (built)

Tokens are shown as they are generated, over server-sent events. Stop aborts the model
call and keeps the partial answer.
Code: `backend/src/core/sse.js`, `backend/src/core/ollama-stream.js`. Test: `tests/modules/streaming/stream.test.js`,
`tests/core/ollama-stream.test.js`.

### Conversation memory (built)

Threads and messages are stored in MongoDB. The next call gets a summary of the older turns
plus the recent ones, and retrieved chunks when the question needs documents.
Code: `backend/src/modules/conversations/`. Test: `tests/modules/conversations/conversations.test.js`.

---

## 5. Measuring quality

### Golden question set (built)

`backend/src/modules/rag/eval/questions.json` has 57 questions over 9 files: 49 with a
known answer (8 of them need two different chunks) and 8 that the documents cannot answer.
Every retrieval or prompt change is scored against the same set.

### Recall@k and MRR (built)

Recall@k asks whether the chunk holding the answer was in the top k. For a two-chunk
question, both facts must be covered. MRR (mean reciprocal rank) asks how high it was:
1 for first place, 1/2 for second, 1/3 for third.
Code: `backend/src/modules/rag/retrieval.js`. Test: `tests/modules/rag/retrieval.test.js`.
Run it: `npm run eval:retrieval` (and `eval:rerank` for the comparison table above).

### Answer quality and LLM-as-judge (built)

Retrieval can be perfect and the answer still wrong. `npm run eval:answers` asks every
question through the real RAG path and grades each answer twice: does it contain the
labelled facts, and does a second model call (the judge) say yes? A judge is only trusted
as far as it agrees with the labels, so the agreement rate is recorded. An unanswerable
question passes only if the system refuses. The record shows whether the cutoff or the
model and grounding check made the refusal.

Measured with qwen2.5:7b: 49 of 49 correct by label, 48 of 49 by the judge, no correct
answer refused, and 8 of 8 unanswerable questions refused (2 by the cutoff, 6 by the
model and grounding check). The single judge "no" was a correct answer whose label was
one vague word, a reminder that the judge is only as good as the label it is given.
Code: `backend/src/modules/rag/eval/report.js`, `backend/src/modules/hallucination/service.js`.
Test: `tests/modules/rag/eval-report.test.js`, `tests/modules/hallucination/judge.test.js`.

### Baseline and regression gate (built)

The measured numbers are saved in `backend/src/modules/rag/eval/baseline.json` and shown
on the Evaluation page. A unit test fails if the saved retrieval or answer scores fall
under a floor, so a change that hurts quality fails CI.
Code: `backend/src/modules/rag/eval/gate.js`. Test: `tests/modules/rag/gate.test.js`.

### Faithfulness and relevance metrics (planned)

Frameworks such as RAGAS score each claim against the sources (faithfulness) and check
that the answer addresses the question (relevance), usually with a model as the judge. The
way I would build it is to split the answer into claims with one model call, judge each
claim against the kept chunks, and report the share supported, next to the current yes/no
judge.

---

## 6. Agents

### Tool calling (built)

The model returns a tool name and JSON arguments instead of text. The program checks the
arguments, runs the tool (here, a search of the knowledge base), and sends the result
back.
Code: `backend/src/modules/agents/ollama-tools.js`. Test: `tests/modules/agents/loop.test.js`.

### ReAct loop with limits (built)

The model reasons, acts, observes the result, and repeats. In this project I cap the loop
at 4 model turns and a time limit, and report whether it finished.
Code: `backend/src/modules/agents/loop.js`. Test: `tests/modules/agents/loop.test.js`.

### Multi-agent systems (planned)

Several agents with separate roles hand work to each other. The way I would build it is a
planner that splits a task, a researcher that uses the search tool, and a checker that runs
the grounding check, then compare against the single agent on the same tasks. It is only
worth it if the single agent's prompt is too large.

---

## 7. Running it for real users

### Accounts, sessions, CSRF (built)

Passwords are stored as salted hashes. The session is an HttpOnly cookie, and every
change request needs a CSRF token. Each account sees shared files plus its own.
Code: `backend/src/modules/security/`. Test: `tests/modules/security/accounts.test.js`,
`session.test.js`, `tests/live/mongo-accounts.live.test.js`. The login was also checked by
hand in the browser (wrong password refused, logout returns 401 on every API).

### Rate limiting (built)

Ask, stream, and upload share 20 requests per minute per person. Failed logins have their
own limit.
Code: `backend/src/modules/security/limit.js`, `login-limit.js`. Test: `tests/modules/security/limit.test.js`.

### Output redaction (built)

Emails, phone numbers, ID numbers, card numbers, and API keys are masked before an answer
is shown or saved.
Code: `backend/src/core/redact.js`. Test: `tests/core/redact.test.js`.

### Tracing (built)

One record per RAG or chat request: retrieval time, rerank time, generation time, tokens,
kept chunks, and whether the reranker ran. Records are stored in MongoDB when it is
configured.
Code: `backend/src/modules/observability/trace-log.js`. Test: `tests/modules/observability/traces.test.js`,
`tests/live/mongo-traces.live.test.js`.

### Cost tracking (built)

Cost is tokens times a rate per million. Local models cost $0. The page also shows what the
same tokens would cost at a sample hosted rate.
Code: `backend/src/modules/providers/pricing.js`. Test: `tests/modules/providers/providers.test.js`.

### Timeouts and retries (built)

A model call times out after 120 seconds. It is tried once more after a connection error,
a timeout before any token arrived, or a 408, 429, or 5xx reply.
Code: `backend/src/core/ollama-retry.js`. Test: `tests/core/ollama-stream.test.js`.

### Containers and CI (built)

The API and the frontend each have an image. Compose starts Mongo and Chroma, and
optionally the API and web images. The API image keeps the reranker model in a
`model-cache` volume. CI runs unit tests, the live Mongo and Chroma tests, and the image
builds.
Code: `backend/Dockerfile`, `backend/docker-compose.yml`, `.github/workflows/test.yml`.

### Hosted model provider (left out)

OpenAI, Anthropic, and others would sit behind the same provider interface. They need a
paid key, which this lab avoids.

### Automatic model routing (left out)

Routing would send easy questions to a small model and hard ones to a big model
automatically. It is left out on purpose: the model is chosen by configuration or by
hand on Providers & Cost.

---

## 8. Beyond prompting

### Multimodal models (planned)

These models read images or audio as well as text. The way I would build it is with a
local vision model in Ollama (for example `llava`), with OCR of scanned PDFs as the first
use case, so pages without a text layer can be embedded.

### Fine-tuning: SFT, LoRA, QLoRA (planned)

Supervised fine-tuning continues training on your own examples. LoRA trains small adapter
matrices instead of all weights. QLoRA does that on a 4-bit model, so it fits on one GPU.
Fine-tuning changes behaviour and style. It is a poor way to add facts, which RAG does
better. The way I would build it is a GPU worker that trains a LoRA adapter on the lab's
answer format, then scores base against tuned with `npm run eval:answers`.

### Preference tuning: RLHF, DPO (planned)

The model is trained on pairs of a better and a worse answer, so it learns to prefer the
better one. The way I would build it is with DPO on pairs collected from the judge's
disagreements, after fine-tuning exists.
