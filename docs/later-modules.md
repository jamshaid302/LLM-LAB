# Later modules

These three are not built. The sidebar items stay **soon**, and the interview answer is
"the way I would build it is…". Say "in this project I…" only after the tests in that
section pass on this repo.

This machine has 64 GB of RAM and an Intel Iris Xe. It has no CUDA GPU and no Python.
The lab also has no paid API key. That is why these wait.

| Section | What is missing | Where it will live |
| --- | --- | --- |
| [Hosted provider](#hosted-provider) | A paid API key | The Providers module, beside Ollama |
| [Multimodal](#multimodal) | A vision model, and a speech model for audio | A new `multimodal` module |
| [Fine-tuning](#fine-tuning) | Python and a CUDA GPU | A notebook outside this repo, then an Ollama model the lab can call |

The local chat call these plans plug into is `completeOllamaChatResult` in
`backend/src/core/ollama-stream.js`. It returns the reply text plus the token counts.
A second provider has to return that same shape.

---

## Hosted provider

### What it is

A hosted provider is a company that runs the model and bills you per token. OpenAI,
Anthropic, Groq, and OpenRouter are examples. The app sends the prompt over HTTPS and
gets text back. You do not download the weights.

The Providers page already multiplies token counts by a sample rate of $0.15 per
million input tokens and $0.60 per million output tokens, and it labels that figure
**not billed**. That multiplication is the lesson. It is not a charge, and those two
numbers are a sample. When you pick a vendor, replace them with the prices on that
vendor's current price page.

### How it works

The rest of the app should keep calling one function. That function picks an adapter
from the model name.

```
POST /api/providers/complete
   → model is in the catalog, or 400
   → local model     completeOllamaChatResult     cost $0
   → hosted model    HTTPS chat completion         cost = tokens × vendor rate
   → same return     text, promptTokens, completionTokens, latencyMs, costUsd
```

An OpenAI-compatible chat completion is the shape to implement first. OpenAI, Groq,
and OpenRouter all accept it, so one adapter covers several vendors. The request is:

```http
POST {HOSTED_BASE_URL}/chat/completions
Authorization: Bearer {HOSTED_API_KEY}
Content-Type: application/json

{
  "model": "the-vendor-model-id",
  "messages": [{ "role": "user", "content": "Reply with the single word pong." }],
  "temperature": 0
}
```

Read `usage.prompt_tokens` and `usage.completion_tokens` from the JSON. The price is
the same formula already in `pricing.js`:

```
costUsd = promptTokens / 1_000_000 × inputRate
        + completionTokens / 1_000_000 × outputRate
```

Anthropic uses a different URL and a different body. Add it as a second adapter only
after the OpenAI-compatible one is tested. Both adapters return the same object.

Failure handling, in this order:

1. Set a 20 second timeout.
2. On HTTP 429, 500, 502, or 503, wait one second and try once more.
3. If that second try also fails, call the local `CHAT_MODEL` and mark the record
   `fallback: "local"`. The cost of that record is $0, and the page says the hosted
   call fell back.
4. On HTTP 401 or 403, do not fall back. Return 502 with "The hosted key was rejected."
   A bad key should be obvious.

The key lives in `backend/.env` only. The browser never sends it, and no log line
prints the `Authorization` header or the key.

### Implementation steps

1. Add these lines to `backend/.env.example` with empty values, and put the real key
   only in `backend/.env` (that file is gitignored):

   ```
   HOSTED_API_KEY=
   HOSTED_BASE_URL=https://api.openai.com/v1
   HOSTED_MODEL=
   HOSTED_INPUT_PER_MILLION=0.15
   HOSTED_OUTPUT_PER_MILLION=0.60
   ```

   Change the URL and the rates to the vendor you actually sign up for. Leave
   `HOSTED_API_KEY` blank in the example file.

2. Read those values in `backend/src/core/config.js`. An empty key means the hosted
   model is not configured.

3. Add `backend/src/modules/providers/hosted.js` with one function,
   `completeHostedChat({ messages, signal, fetchImpl })`. It performs the HTTP call
   above and returns `{ text, promptTokens, completionTokens }`. Pass `fetchImpl` so
   tests can substitute a fake.

4. Add the hosted model to the catalog in `pricing.js` when the key is set. Include
   `provider: "hosted"`, the model id, and the two rates. Leave the existing
   `hostedExample` line in place for local calls, still labeled not billed.

5. In `service.js`, branch on the catalog entry. A local id still calls
   `completeOllamaChatResult`. A hosted id calls `completeHostedChat`, then the
   fallback rules above. Store `costUsd` from the real rates. Store `fallback` when
   the local model answered.

6. `GET /api/providers/models` gains `hosted: { configured: true }` or
   `{ configured: false }`. It never returns the key.

7. On the Providers page, show the hosted model in the menu only when `configured`
   is true. When it is false, show the sentence "Set HOSTED_API_KEY on the server."
   A hosted row shows the real dollar amount. A fallback row says it used the local
   model.

8. Do not log the prompt if you later send customer documents to a hosted model. The
   usage record keeps model, token counts, latency, cost, and fallback. It does not
   keep the key.

### Testing

Automated tests stay on a fake `fetch`. They must pass with no key and no network.
Run them from `backend/` with `npm test`.

| Test | What you set up | Expected result |
| --- | --- | --- |
| Happy path | Fake `fetch` returns a chat completion with `pong`, `prompt_tokens: 12`, `completion_tokens: 1` | The route returns that text and those counts. `costUsd` matches the configured rates |
| Key stays on the server | Complete a hosted call | The response JSON and the usage log do not contain the key or `Bearer` |
| Unknown model | Body names a model that is not in the catalog | HTTP 400. The fake `fetch` is not called |
| Rejected key | Fake `fetch` returns 401 | HTTP 502, "The hosted key was rejected." The local model is not called |
| One retry | First response is 503, second is a normal completion | Two HTTP calls. The reply is the hosted text. `fallback` is absent |
| Fallback | Both tries return 503 | The local model is called. The record has `fallback: "local"` and `costUsd: 0` |
| Missing key | `HOSTED_API_KEY` is empty | `GET /models` says `configured: false`. Posting the hosted model id is HTTP 400 |

Manual test, after the automated tests pass. Use the vendor's cheapest model and a
tiny prompt so the charge is a fraction of a cent. Check the vendor's billing page
afterward and delete the key if you are done with it.

| Step | Expected result |
| --- | --- |
| Leave `HOSTED_API_KEY` empty and restart the API | Providers still lists Llama and Qwen. The page says the hosted key is not set. A local run still costs $0.00 |
| Put a real key in `backend/.env`, set `HOSTED_MODEL` and the current rates, restart | The hosted model appears in the menu |
| Run `Reply with the single word pong.` | The reply is that word, or a close variant. Prompt tokens, completion tokens, and a non-zero cost are filled in. The usage row does not say "not billed" |
| Search the API log for the key | The key is not there |
| Set the base URL to `http://127.0.0.1:9` and run again | After the timeout and one retry, the reply comes from the local model and the row says it fell back |
| Remove the key, restart | Local runs still work. The hosted model leaves the menu |

---

## Multimodal

### What it is

A multimodal model accepts more than text. A vision model reads an image and text
together. A speech model turns audio into text. The chat model you already run does
neither. `llama3.2:1b` and `qwen2.5:7b` only see tokens from strings.

Two jobs get confused here, and they use different code:

- **Ask about a picture.** The image and the question go to a vision model. The answer
  comes back as text. Nothing is stored in Chroma.
- **Read a scan into the knowledge base.** A scanned PDF has no text layer. The vision
  model copies the words into a string. That string then goes through the RAG pipeline
  you already have: chunk, embed, search. The image itself is not an embedding.

Audio is a third job. A speech model writes a transcript. The transcript is ordinary
text, so it can be a chat message or a document. The audio bytes are not embedded.

Quantization is how a local model is made smaller. The weights are stored with fewer
bits. The file is smaller and the reply is faster. The answers get slightly worse.
You measure that drop on a fixed set of images before you keep the smaller file.

### How it works

Ollama's chat API already accepts images. A vision model such as `moondream` or
`llava` is pulled like any other model. The message carries the question and the
image as base64:

```json
{
  "model": "moondream",
  "messages": [
    {
      "role": "user",
      "content": "What code is written in this image?",
      "images": ["<base64, no data: prefix>"]
    }
  ],
  "stream": false
}
```

`moondream` is the one to pull first. It is small enough to try on this CPU. `llava`
is the larger check. A 7B vision model on Iris Xe will be slow. A GPU is what makes
that larger model reasonable. The first slice does not need a GPU if you stay on
`moondream` and accept a long wait.

Speech uses a separate model. Pull an Ollama speech model such as `whisper` and send
the audio file to its transcription API. The lab then takes the transcript string and,
if you want retrieval, writes it through the existing document upload. Do not add a
new vector type for sound.

A scanned PDF follows the image path one page at a time. Today's PDF upload uses
`unpdf` and returns 400 when the file has no text layer. The later path renders each
page to an image, asks the vision model for the words, and uploads that text under
the original filename. The bytes of the PDF can stay on disk the way text PDFs
already do. The chunks come from the extracted words.

### Implementation steps

1. Pull the model when you are ready to test. This downloads several gigabytes:

   ```
   ollama pull moondream
   ```

   Add `VISION_MODEL=moondream` to `backend/.env` and to `config.js`, with that default.

2. Create `backend/src/modules/multimodal/` with the usual module shape: `index.js`,
   `router.js`, `service.js`, and a README. Register it in `backend/src/modules/index.js`
   and set the sidebar entry in `frontend/src/modules/registry.js` to `ready` only
   after the tests below pass. Until then the badge stays **soon**.

3. `POST /api/multimodal/ask` accepts `{ "question", "image" }`. `image` is base64 of
   a PNG or JPEG, at most 4 MB. Reject a missing question, a missing image, a
   non-image, and an oversized body with HTTP 400. Call Ollama with the message shape
   above. Return `{ "text", "model", "latencyMs" }`.

4. The route does not write the image into `backend/src/modules/rag/docs/`. It does
   not embed the image. It does not put the image in the usage log.

5. Add the page `frontend/src/modules/multimodal/MultimodalPage.jsx`. A file input, a
   question box, and the reply. Show the latency. Send `X-User-Id` the same way the
   RAG page does, so a later saved caption belongs to the person who is asking.

6. Speech is the second slice, after the image test is green. `POST /api/multimodal/transcribe`
   accepts the audio bytes, calls the speech model, and returns `{ "text" }`. A button
   on the same page can send that text on to `/api/rag/documents` as a `.txt` upload
   for the current user. That reuses the embed queue. It does not create a second one.

7. Scanned PDFs are the third slice. Render a page, call the vision model, and if the
   text is empty, keep today's 400 "This PDF has no extractable text." If the text is
   non-empty, hand it to the existing upload path. Record in the README that the words
   came from the vision model, because a misread scan becomes a wrong chunk.

8. Quantization check, once one model works. Pull a second tag of the same model if
   the registry offers a smaller quant. Run the same ten images through both. Write
   the accuracy and the seconds into the module README. Keep the smaller tag when the
   accuracy on those ten is the same. Keep the larger tag when it reads codes the
   smaller one misses.

### Testing

Automated tests use a fake `fetch`. They do not pull a model. A one-pixel PNG encoded
as base64 is enough of an image for the request-shape test.

| Test | Expected result |
| --- | --- |
| Ask with a question and a small PNG | The Ollama body has `images` set to that base64 and `content` set to the question. The route returns the fake model's text |
| Missing image, missing question, or a `.txt` payload | HTTP 400. Ollama is not called |
| Image over 4 MB | HTTP 400 |
| Ask | The RAG docs folder is unchanged |
| Transcribe, when you build that slice | The speech request contains the audio, and the response text is what the fake model returned |

Manual test. Use a photo you take yourself, with large clear text. A good fixture is
a note that reads `The visitor parking code is maple-17.`

| Step | Expected result |
| --- | --- |
| `ollama pull moondream`, set `VISION_MODEL`, restart the API | Health still loads. The Multimodal page opens |
| Upload the note and ask `What is the code in this image?` | The reply contains `maple-17`. Latency is printed. On this CPU the wait can be a minute |
| Ask `What is written here?` on a blank white image | Write down what it says. A invented code means the vision model is guessing. Do not ingest that text into RAG |
| Upload the same note as a normal `.txt` on the RAG page and ask the parking question | The source is the text file. The image ask did not add a chunk |
| After the speech slice: record "the gym is on the third floor" and transcribe | The transcript contains "gym" and "third". Sending it to RAG cites that file for a gym question |
| After the scan slice: upload a PDF that is only a picture of the note | The extracted text contains `maple-17`, and the source name is the PDF name |
| Run the same ten images on two quants | The README records which tag you kept, with the accuracy and the seconds |

---

## Fine-tuning

### What it is

Fine-tuning keeps training a model on your examples so it imitates them. The result
is a new set of weights. Three names come up in interviews:

| Name | What you train | What it costs |
| --- | --- | --- |
| SFT (supervised fine-tuning) | Every weight, on pairs of input and the output you want | A large GPU and a long run. A full 7B SFT does not fit a free Colab GPU |
| LoRA | Small adapter matrices beside the frozen base model. You merge or attach them at load time | Much less memory. The adapter file is megabytes, and you can swap it out |
| QLoRA | The same LoRA adapters, while the base model is loaded in 4-bit | The practical choice on a free T4 GPU |

Use it for a behavior a prompt will not hold: a house style, a rigid format, a
dialect. Leave facts in RAG. When the wifi password changes, replacing `office.txt`
and re-indexing is the update. A fine-tune would need a new dataset and a new run,
and the old password can still come out of the weights.

This lab's training run is a format, on purpose. Each target answer is one sentence
that starts with `Based on the note:` and uses only words from the input. The held-out
set checks that format. It also checks that the model did not add a fact that was not
in the input.

### How it works

Training does not run inside Express. Node on this PC cannot see a CUDA GPU, and
Python is not installed. The job runs in a Colab or Kaggle notebook with a GPU
runtime. The artifact that comes back is an Ollama model. The lab then calls it
through the provider function you already have.

```
JSONL of { input, output } pairs
   → notebook on a T4          QLoRA adapters on a frozen 4-bit base
   → held-out compare          adapter must beat the base model on the format
   → export GGUF               ollama create lab-tuned
   → POST /api/providers/complete     same prompt, base model and lab-tuned
```

If the adapter does not beat the base model on the held-out set, delete the adapter.
A fine-tune that only memorizes the training rows is a failed experiment, and the
write-up should say so.

### Implementation steps

1. Write the dataset on your own machine as `train.jsonl` and `heldout.jsonl`.
   Forty training rows and twenty held-out rows are enough for this exercise. Each
   line is one JSON object:

   ```json
   {"input": "Note: The gym is on the 3rd floor.", "output": "Based on the note: The gym is on the 3rd floor."}
   ```

   Write the notes yourself. Do not paste `knowledge.txt`, `office.txt`, or the
   cent-trading file into the training set. Those facts belong to retrieval. Keep
   the held-out file untouched until the evaluation step. Do not commit either file
   if the notes are private.

2. Open a new Colab notebook and set the runtime to a GPU (a T4 on the free tier).
   Confirm the GPU before installing anything:

   ```python
   import torch
   print(torch.cuda.get_device_name(0))
   ```

   If that raises an error, you are still on CPU. Stop. Training a 7B model on CPU
   is not the plan.

3. Install a QLoRA stack. Unsloth is the shorter path on a free T4. The alternative
   is `transformers`, `peft`, `bitsandbytes`, `trl`, and `datasets`.

   ```python
   # Colab cell. Versions move; pin whatever the Unsloth install page lists that week.
   # !pip install unsloth
   ```

4. Load a 7B instruct base in 4-bit. `unsloth/Qwen2.5-7B-Instruct-bnb-4bit` matches
   the 7B family you already chat with. Attach a LoRA adapter: rank `r=16`,
   `lora_alpha=16`, dropout `0`, and the attention projections the library marks as
   target modules. Train those adapter weights only.

5. Train with `SFTTrainer` (or Unsloth's trainer): 1 to 3 epochs, learning rate
   `2e-4`, max sequence length `512`, batch size 1 or 2 with gradient accumulation
   to an effective batch of 8. Watch the loss fall. Stop early if it goes to zero in
   the first few steps. That usually means the set is too small and the model is
   memorizing rows.

6. Save the adapter directory. Run the twenty held-out inputs through the base model
   and through the adapter, with the same instruction in front of every input:

   ```
   Reply in one sentence that starts with "Based on the note:" and uses only the note.
   ```

   Score each output by hand or with a small script:

   - Format: the answer starts with `Based on the note:`.
   - Faithfulness: every number and name in the answer also appears in the input.

   Count wins. Keep the adapter only when it beats the base model on format and does
   not lose on faithfulness. If it ties or loses, delete the adapter and write the
   counts in this file under a short "result" note. That negative result is a valid
   outcome.

7. Export the winning adapter to GGUF with the converter your training library
   documents (Unsloth's `save_pretrained_gguf`, or llama.cpp's convert script). Copy
   the GGUF to the PC that runs Ollama. A `Modelfile` is:

   ```
   FROM ./lab-tuned.gguf
   ```

   Then:

   ```
   ollama create lab-tuned -f Modelfile
   ollama run lab-tuned "Note: The gym is on the 3rd floor."
   ```

8. Back in this repo, add `lab-tuned` to the provider catalog at $0, next to the two
   local models. Do not point `CHAT_MODEL` at it until the comparison below looks
   right. The RAG page should keep using the base chat model. The tuned model has
   not earned the knowledge-base answers.

### Testing

There is no `npm test` for the notebook. The automated check is the held-out count.
The lab check is a provider call after `ollama create`.

| Check | Expected result |
| --- | --- |
| `torch.cuda.get_device_name(0)` in the notebook | A GPU name, such as Tesla T4 |
| Adapter file size | Megabytes, not the full multi-gigabyte base weights |
| Held-out format score | The adapter's count is higher than the base model's count |
| Held-out faithfulness | The adapter does not add codes or names that are absent from the input. `maple-17` appears only when the input contained `maple-17` |
| A tie or a loss | The adapter is deleted. The counts are written down. The lab catalog does not gain a model |
| `ollama list` after a win | `lab-tuned` is listed |

Manual test in the lab, only after a win:

| Step | Expected result |
| --- | --- |
| Restart the API and open **Providers & Cost** | `lab-tuned` is in the menu beside the two base models. Its price is $0.00 |
| Run a held-out note you did not train on | The reply starts with `Based on the note:` and does not add a new fact |
| Run the same note on `qwen2.5:7b` | Record both replies. The tuned model should hold the format more often |
| Ask `lab-tuned` for the visitor wifi password | It does not answer `lantern-42` from memory of this repo. That fact was never in the training file. The RAG page, on the base model, still answers `lantern-42` from `office.txt` |
| Remove the model with `ollama rm lab-tuned` | The menu hides it after you take it out of the catalog, or the call returns a clear error. The base models still run |
