# AI and Generative AI — interview preparation

Questions you should be able to answer out loud for a senior full-stack role that
includes AI. Each answer has the idea, how you would build it, and where it shows up
in a real product.

Say "in this project I…" only for the modules marked **built**. For **planned** modules,
say "the way I would build it is…". Claiming you shipped something you only read about
is easy to catch.

Related docs: [LLM Fundamentals](../backend/src/modules/fundamentals/README.md),
[RAG](../backend/src/modules/rag/README.md),
[Semantic Search](../backend/src/modules/semantic-search/README.md),
[later modules](later-modules.md) (hosted provider, multimodal, fine-tuning — not built).

---

## Questions that come up in almost every interview

### What is an LLM, in one minute?

A large language model predicts the next token given the tokens so far. A token is a
chunk of text, often part of a word. It is not looking up facts and it is not running
your code. It is continuing a pattern. That is why it can write fluent nonsense: fluent
and true are different jobs. Everything else — prompts, RAG, tools, fine-tuning — is a
way of steering that next-token prediction.

### When do you use prompting, RAG, or fine-tuning?

Prompting when the model already knows how to do the task and you need a format or a
policy. RAG when the answer depends on your documents, and those documents change.
Fine-tuning when you need a stable style or skill that prompting cannot hold, and you
have hundreds or thousands of good examples. Most product features are prompting plus
RAG. Fine-tuning is the expensive option, and it goes stale every time the facts change.

### How do you reduce hallucinations?

Constrain the input and check the output. Put the source text in the prompt and tell the
model to refuse when it is not there. Drop retrieved chunks below a similarity cutoff so
you do not feed it unrelated text. Ask it to cite, then verify the citation actually
supports the sentence. For structured data, parse the JSON and retry or fail instead of
showing broken output. Measure it. A refusal rate on questions the corpus cannot answer
is a number you can defend.

### How do you keep an AI feature from becoming expensive?

Count tokens on the way in and the way out. Cap `max_tokens`. Cache repeated questions.
Send the small model the easy calls and the large model only the hard ones. Do not put
the whole conversation back into the prompt forever; summarize it. RAG should retrieve a
few short chunks, not the whole document. Log cost per request so a bad prompt shows up
as a bill, not a surprise.

### When is an agent the wrong design?

When the steps are known in advance. A fixed pipeline — retrieve, then answer, then
check — is easier to test and cheaper than a loop that decides its own steps. Use an
agent when the next step depends on a tool result you cannot predict, and put a step
limit on it. Multi-agent setups are rarely worth it until one agent with good tools is
already failing for a clear reason.

---

## Built — RAG

### What is RAG?

Retrieval-augmented generation. You embed your documents, embed the question, take the
nearest chunks, and put those chunks in the prompt. The model answers from that text
instead of from memory. In this project, `POST /api/rag/ask` does that over every
`.txt` file in the docs folder and returns the answer plus the chunks, their file
names, and their similarity scores.

### Why chunk the documents?

Models have a context limit, and a long document dilutes the relevant sentence. Chunks
of a few hundred characters keep one idea together. Overlap keeps a sentence that sits
on a boundary from being cut in half. Too-small chunks lose the point. Too-large chunks
waste the prompt and hurt search. That is why `RAG_CHUNK_SIZE` and `RAG_CHUNK_OVERLAP`
are settings, not magic numbers.

### What does a similarity score mean?

Each chunk is a vector from an embedding model. Cosine similarity says how close the
question's vector is to a chunk's vector. In this app a real match scores around 0.7 to
0.8, and an unrelated chunk scores around 0.4. The score is not a probability and it is
not truth. It only says "this text is near the question."

### How did you decide the similarity cutoff?

I measured it. Eleven questions whose answers are in the files all retrieved the right
chunk, with top scores from 0.571 to 0.843. "What is the capital of Brazil?" scored
0.394, so a cutoff of 0.5 refuses it and never calls the model. Recall@3 stayed 1.0
after the cutoff, and mean reciprocal rank stayed 1.0, so the right chunk was still
rank 1. "Who is the CEO?" scored 0.566 and still gets through. I did not raise the
cutoff, because the leash question only scored 0.571 and a higher line would drop a
real answer. That tradeoff is in `eval/baseline.json`. Adding `office.txt` did not
move the original ten scores.

### Where do the vectors live?

In Chroma, a separate vector database running in Docker. The original in-memory store
is still in the code and tests still use it. `RAG_STORE=memory` switches back to it.
Chroma stores cosine distance, so the app converts that to similarity before the 0.5
cutoff. After the swap, recall@3 was still 1.0 and the gym chunk still scored 0.774.
Restarting the API, and restarting the Chroma container, both load the chunks without
embedding them again when the folder hash matches. The folder is `knowledge.txt` and
`office.txt`, seven chunks. Each chunk is labeled with the file it came from, so the
wifi password cites `office.txt` and the gym cites `knowledge.txt`.

### What is still missing?

Citations are not checked against the chunk text. The loader reads `.txt`, `.md`, and
the text layer of a `.pdf`. Upload embedding runs in this process; a queue that lives
in another process is still unbuilt.

### Where does RAG show up in a MERN product?

A help bot over your own docs, search that understands a question instead of keywords,
and "ask this PDF." The Express route looks like any other route. The new pieces are
the embedding call, the vector search, and the prompt. MongoDB Atlas can store the
chunks and run the vector search, so you do not need a second database on day one.

---

## Built — LLM fundamentals: sampling and tokens

### What is temperature?

It controls how often the model picks a less likely next token. Zero means "always take
the most likely token," so the same prompt repeats. Higher values add variety and, past
a point, nonsense. I use 0 for anything I need to test or parse, and something like 0.7
when variety is the point. In this project the Precise preset is temperature 0 with a
seed, and running it twice returns the same text.

### What is top-p?

It keeps only the smallest set of tokens whose probabilities add up to `p`, and samples
from those. Top-p 0.9 throws away the long tail. Temperature and top-p both reduce
surprise. Changing both at once makes it hard to know which one did the work, so I
change one at a time.

### What is a seed for?

It makes the random picks repeatable. Same prompt, same settings, same seed, same
answer. That is how you write a test or show a bug again. It is not a guarantee across
different model versions.

### How do you count tokens, and why do you care?

The model reports prompt tokens and completion tokens. A rule of thumb is four
characters per token, and it is often wrong. In this playground one short tagline was
39 prompt tokens plus 13 completion tokens, while the estimate said 30. You care because
you pay per token, and because the context window is a token budget. If the prompt plus
the answer exceeds it, the model never sees the start of the prompt.

### What is the context window?

The maximum number of tokens the model can read at once, including the system prompt,
the history, the retrieved chunks, and the answer you still have to generate. When a
chat gets long you summarize or drop old turns. You do not keep appending forever.

---

## Built — LLM fundamentals: prompt patterns

### What is zero-shot, and why keep it?

Zero-shot is the task with no examples and no format instructions. It is the baseline.
If a fancier prompt does not beat zero-shot on the same question, with temperature held
at 0, the fancy prompt is not helping. This project's Compare button runs zero-shot next
to the other three so that comparison is visible.

### What is a role prompt?

A system message that assigns a job and usually an output shape. "You are a support
lead. Reply as `Sentiment:` and `Next step:`." Role prompts are cheap and they work
when the model already knows the job. They fail when the shape is strict and the model
is small, because nothing checks that it obeyed.

### What is few-shot prompting?

You show two or three finished examples, then the new task. The model continues the
pattern. In this project the few-shot messages are a system line, two user/assistant
example pairs, and the task as the last user turn. Examples should look exactly like
the answer you want. Bad examples teach the wrong format. Few-shot costs tokens on every
call, so use it when the format is awkward to describe and cheap to show.

### What is chain-of-thought?

You ask the model to reason in steps before the final line. It helps on questions where
jumping to the answer skips a step. It costs more tokens and more latency, and a low
`max_tokens` cuts the reasoning off before the answer. I would not use it for a
one-line classification. I would use it for a calculation, a policy decision, or a
bug that needs a trace.

### How do you know a prompt change actually helped?

Freeze the model, the temperature, and the seed. Change only the prompt. Run a set of
tasks, not one. Look at format compliance and correctness, not at whether the answer
sounds better. In this lab that is what the pattern comparison is for. The next step is
to score those runs instead of reading them.

---

## Built — structured output

### How do you make a model return JSON your API can trust?

Ask for a schema, parse the text, and validate the fields. If parsing fails, send the
error back once and ask for a correction. If it fails again, return an error and do not
invent the object. Temperature 0 makes the shape more stable. A vendor JSON mode raises
the odds, and it is still not a substitute for validation.

In this project `POST /api/fundamentals/structured` requires `sentiment` (`positive`,
`negative`, or `mixed`) and a non-empty `nextStep`. A fenced or prose-wrapped object
still parses. Two failures return 422 with `data: null` and both raw attempts. The UI
shows the object only when `ok` is true.

### Where does this show up?

Turning a support email into `{ sentiment, nextStep }`, extracting fields from an
invoice, or filling a form. The screen can be a chat. The handler that writes to
MongoDB should receive a validated object, the same as any other Express route.

---

## Built — providers and cost

### How do you support more than one model?

In this project the chat call is `completeOllamaChatResult`. The request names the model.
`llama3.2:1b` and `qwen2.5:7b` both go through that function, and conversation summaries
use it too. The way I would add a hosted provider is a second function with that same
return shape: text, prompt tokens, and completion tokens. The key stays in `backend/.env`.
A 401 comes back as an error. A timeout or a 503 is retried once, then the local model
answers and the record says it fell back. The steps and the tests are in
[docs/later-modules.md](later-modules.md#hosted-provider). That function is not built.
There is no fallback when a call fails, and no cache.

### How do you track cost?

Each call on the Providers page stores the model, prompt tokens, completion tokens, and
latency. Cost is `tokens / 1,000,000 × rate`. Both local rates are $0. The same counts
are also multiplied by a sample hosted rate, $0.15 per million input tokens and $0.60
per million output tokens, and the page says that figure was not billed. The log is in
memory, so a restart clears it. Other pages do not all write this log yet.

---

## Built — advanced RAG

### What is hybrid search?

In this project a comparison runs BM25 and the vector search, then merges the lists
with reciprocal rank fusion. On 29 October 2026, with `nomic-embed-text` and the
current docs, both retrievers had recall@3 of 1 and MRR of 1. The right chunk was
already rank 1 for every answerable question, including the server-room code and
`lantern-42`. Brazil stayed under the 0.5 cutoff. "Who is the CEO?" stayed above it.
Hybrid was not adopted. RAG and Semantic Search still use vector search.

### What is reranking?

The way I would build it is a second, slower model that rescores a wider first list,
about 20 chunks, and keeps the best 3. I would pay latency for a better order, and I
would keep it only if recall or MRR on the question file went up. Reranking a bad
first search cannot find a chunk that never came back. That rescoring model is not
built.

### What is query rewriting?

In this project a follow-up on the Conversations page is rewritten into a standalone
search query before Chroma is called. The reply still sees the sentence the user
typed. A rewrite helps follow-ups and can drift off the user's words, so the vector
search is what the measurement above scored, not the rewrite.

---

## Built — semantic search

### How is semantic search different from RAG?

In this project the Semantic Search page embeds the query and returns the nearest
chunks, each with a score and a file name. The chat model is not called. RAG uses that
same search as context for a generated answer. The cutoff is shared, so a weak neighbor
is listed as dropped on the search page and is withheld from the model on the RAG page.
Who is asking limits both to the shared samples plus that person's files.

Deduplication, clustering, and recommendations are the same embedding idea. They are
not built.

---

## Built — document upload

### How does a new document get into the knowledge base?

In this project the RAG page reads a `.txt` or `.md` file as text, or a `.pdf` as
base64, and posts the name with that body. The API allows only a simple file name.
Text and markdown are written as UTF-8. A PDF is written as the original bytes, and a
PDF with no text layer is rejected before a job starts. The response is HTTP 202 with
status `queued`. One worker in the API process then chunks that file, embeds it, and
writes the vectors. The page polls until the status is `ready` or `failed`. A failed
job can be retried without sending the file again. Chunks keep the uploaded name.
Remove waits until an in-flight embed of that file finishes, then deletes the file and
drops its chunks together. `knowledge.txt` and `office.txt` cannot be removed. A
folder path and an empty file are rejected. The Document Pipeline page lists those
same jobs for the person selected in **Who is asking**. The RAG page still uploads
through its own route, and both routes share the one in-process queue.

### How would you run that job outside the API process?

The way I would build it is a durable queue and a separate worker. The API would only
store the file and enqueue an id. The worker would survive an API restart, retry with
backoff, and report progress that more than one server can read. In this project the
queue is memory inside the API. A restart drops it. The saved file changes the folder
hash, so startup embeds the folder again. That separate worker is not built.

---

## Built — streaming chat

### Why stream tokens?

A full answer can take seconds. This app keeps the HTTP response open and writes
Server-Sent Events: `token` frames as Ollama produces them, then `done`. The page
appends each frame. Stop aborts that response, which aborts the Ollama request, and
the tokens already on screen stay there. RAG uses the same stream after retrieval. A
question below the cutoff still skips the model and sends the refusal as one token.
Streaming Chat itself does not save the reply. Conversations does.

---

## Built — conversations

### Why do you have both MongoDB and a vector database?

They store different things. Chroma holds embeddings of the knowledge-base chunks and
answers "which paragraph is closest to this question?" MongoDB holds threads and
messages and answers "what did we already say, in order?"

The next prompt uses both. Recent messages are copied out of MongoDB so the model can
continue the transcript. A follow-up such as "What is the password?" is a bad search
string, so a short model call rewrites it into a standalone query first. Chroma sees
that query. The reply still sees the original sentence. "What is my name?" comes from
the transcript. "Where is the gym?" comes from `knowledge.txt` when nobody has said it
yet.

A vector search is the wrong tool for "message 1, then 2, then 3." Putting chat text
into the same Chroma collection as the knowledge base would let an old reply compete
with the gym chunk. The last 12 messages are sent in full. Older ones are summarized
into one paragraph, and that paragraph is what later prompts see for the early turns.
The summary is its own model call, so it costs tokens, and it can drop a detail. The
original messages stay in MongoDB. The header **Who is asking** is Local or Guest.
A thread belongs to that person, and the other person's list does not include it.
There is no password.

---

## Built — evaluation

### How do you evaluate a RAG system?

In this project the LLM Evaluation page scores the saved question set. Recall@k is
whether the expected phrase was in the top k. MRR is whether it was near the top. The
cutoff's effect is the same pair of numbers after scores under 0.5 are removed. On
29 October 2026 that run was recall@3 of 1, MRR of 1, and 1 of 2 unanswerable questions
refused. The chat model is not called. An LLM judge and a CI gate are not built.

---

## Built — hallucination detection

### How do you check that an answer is grounded?

In this project the Hallucination Detection page asks one question through the RAG
pipeline. If no chunk clears the cutoff, the verdict is that the search missed and the
model is not called. If the model answers with only a citation, or with a name or code
that is not in the kept chunks, the answer is replaced with "I don't know" and the
verdict is `replaced`. The source line stays. A name the file itself states is kept, and
the verdict is `grounded`. The check looks for names and codes. It is not a second model.

---

## Built — AI agents

### What is tool calling?

In this project the AI Agents page gives the model one function, `search_documents`,
with a `query` string. The model returns the name and the arguments. The API runs the
same retrieval as Semantic Search, including the 0.5 cutoff and the person selected in
Who is asking. The model does not read the files itself. The tool result is fenced in a
`<document>` tag, and the system message says that text is data.

### What is a ReAct loop, and how do you bound it?

The model calls the tool, the API runs it, and the result goes back for another turn.
The loop stops at 4 steps or 3 minutes, whichever comes first, and returns the last
answer it had. Each tool call is in the response: the name, the arguments, whether they
were valid, and the file names and scores that were kept. Chunk text is not in that list.

### How do you evaluate an agent?

The page reports whether the run finished, how many steps it took, and whether every
argument was valid. The automated test uses a fake model that returns a known tool call,
an unknown tool, a step cap, and a time cap. A live run uses `qwen2.5:7b`, not the
smaller chat model. On 29 October 2026, “Where is the company gym?” finished in 2
steps. The call was valid, the query was “company gym location”, and `knowledge.txt`
was kept at 0.772. The answer says the gym is on the 3rd floor. Multi-agent handoff
is not built.

---

## Planned — multi-agent systems

### When would you split work across agents?

When the jobs are genuinely different and you can name the handoff. One agent drafts,
another checks policy, and the checker cannot be the same prompt because it will agree
with itself. If you cannot name the artifact passed between them, it is one agent with
extra steps. Most interview designs that start with five agents should be one pipeline.

---

## Built — prompt injection fence

### What happens when a document says "ignore your instructions"?

In this project the rules for RAG and for a conversation sit in the system message.
Each retrieved chunk is wrapped in a `<document>` tag in a later message, and the
chunk text cannot close that tag early. The system message says that text is data
and not to follow orders written there. A test checks that an override, including one
that tries to end the tag, stays inside the tag and out of the rules.

That fence is not a lock. On 29 October 2026, with `llama3.2:1b`, a file that said
to ignore the instructions and name the CEO as Alice was the top hit at 0.734. The
reply was `[1]`. The RAG page now replaces a citation-only reply, and a name the
chunks do not contain, with "I don't know". Checked the same day, that Alice file
still scored 0.734 and the reply was replaced with "I don't know". The source line
stayed. If the model says Alice, that reply is kept, because the file contains the
name. The header switch stores a new upload under that person. A question searches
the shared samples plus that person's files, so the other person does not receive
that chunk. Passwords and a real session are not built.

---

## Planned — security

### What else do you lock down?

The way I would build it is auth on every route, including re-ingest. A body size
limit. A rate limit. Do not log full prompts if they contain customer data. Strip
secrets from tool output before it goes back to the model. That is not built.

---

## Built — observability

### What do you log for one AI request?

In this project each RAG ask, RAG stream, Streaming Chat message, and Conversations
reply writes one trace: the route, the person, retrieval time, generation time, prompt
tokens, completion tokens, and the file name and score of each kept or dropped chunk.
The question is not stored. The list is the newest 50 traces, in memory. A card that
says the search missed had no kept chunk and did not call the model. A card with kept
chunks and a replaced answer means the model wrote something the grounding check would
not keep. A restart clears the list. A durable log is not built.

---

## Planned — deployment

### How do you ship this?

The API and the web app are containers. The vector database is a service with a volume.
Ollama or the hosted provider is configured by env, not by a hardcoded URL. CI runs the
unit tests and the golden-set eval. If the provider is down, the route returns a clear
error and the rest of the MERN app still works. The model call is a dependency, like a
payment API, and it gets the same treatment: timeout, retry once, then fail.

---

## Planned — multimodal

### What changes when the input is an image or audio?

The way I would build it is a vision model in Ollama, starting with `moondream`. The
message carries the question and the image as base64. A scanned page is extracted to
text, and that text goes through the RAG pipeline this project already has. Audio is
speech-to-text first, then the same chat path. The image and the audio are not
embedded. Quantization makes a local model smaller and faster and slightly worse. I
would run the same ten images on two sizes and keep the smaller one only when it still
reads the codes. The steps are in
[docs/later-modules.md](later-modules.md#multimodal). This is not built. This machine
has no vision model pulled.

---

## Planned — fine-tuning

### What is the difference between SFT, LoRA, and QLoRA?

Supervised fine-tuning continues training on your input-output pairs so the model
imitates them. LoRA does not retrain every weight. It trains small adapter matrices,
which is much cheaper and easier to swap. QLoRA does that while the base model is
loaded in 4-bit, so it fits a free Colab T4. The way I would build it is a notebook
outside this repo, forty training rows and twenty held-out rows, for a format rather
than for facts. The adapter stays only when it beats the base model on that held-out
set. A win is exported to GGUF and loaded with `ollama create`. The steps are in
[docs/later-modules.md](later-modules.md#fine-tuning). This is not built. This machine
has no Python and no CUDA GPU.

### Why is fine-tuning a poor default?

It bakes facts into weights. When the refund policy changes, RAG updates with a
document and a re-index. A fine-tune needs a new dataset and a new training run. Use it
for a behavior you cannot prompt, such as a house style or a specialized format, and
keep the facts in retrieval.

---

## A short story you can tell

"I built a local RAG chat. It used to return three chunks no matter the score, so an
off-topic question still received unrelated context. I measured ten questions: the right
chunk scored from 0.57 to 0.80, and Brazil scored 0.39. A cutoff at 0.5 kept recall@3
at 1.0 and refuses Brazil without calling the model. A near miss, 'Who is the CEO?',
scored 0.57 and still gets through, and raising the line would drop a real answer. I also built a
playground that holds temperature and seed still and runs the same task as zero-shot,
role, few-shot, and chain-of-thought. A separate route parses `{ sentiment, nextStep }`,
retries once with the validation error, and returns 422 with no object if both tries
fail. The cutoff, the golden set, and a Chroma store are already in place. A restart
loads the chunks instead of embedding them again. Answers arrive token by token, and
Stop aborts the model call. Threads and messages live in MongoDB, and the recent turns
go into the next prompt along with any matching knowledge-base chunk. When the thread
grows past that window, the older turns are summarized and the summary is what the
model sees for them. A separate page runs the same chat call against either local model
and records the tokens, the latency, and a $0 price."
