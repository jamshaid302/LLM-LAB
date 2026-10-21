# LLM Fundamentals module

**Status:** in progress · **UI:** sidebar → Foundations → LLM Fundamentals · **API prefix:** `/api/fundamentals`

## What this module is about

Before RAG or agents, you need to know what a model is actually doing when it answers.

A language model writes one **token** at a time. A token is a piece of text, often part
of a word. At each step the model gives every possible next token a probability, then
picks one. The settings below control how it picks:

- **Temperature.** At 0 the model always takes the most likely token, so the same prompt
  gives the same answer. Higher values let less likely tokens through, so answers vary
  and get more creative, and eventually less sensible.
- **Top-p.** Limits the pick to the smallest set of tokens whose probabilities add up to
  `p`. At 0.9, the unlikely last 10% is never chosen.
- **Seed.** Fixes the random choices, so even a high temperature becomes repeatable.
- **Max tokens.** A hard stop on the answer's length. It cuts mid-sentence if hit.
- **System prompt.** Instructions that frame every answer, such as "Answer in one sentence."

Tokens also matter outside the playground: models are priced per token, and every model
can only read a fixed number of them at once (its **context window**).

**What you learn here:** why the same prompt gives different answers, how to make output
repeatable when you need it, and why "characters divided by 4" is only a rough token
estimate.

**Covered so far:** sampling settings and token counts. **Next slices:** prompt patterns
(few-shot, chain-of-thought) and structured JSON output with validation.

## How it works

```
playground form
   → POST /api/fundamentals/complete
   → sampling.js     validate prompt and settings; reject bad values with a 400
   → complete.js     call Ollama's /api/chat with temperature, top_p, num_predict, seed
   → response        answer text, the settings used, real token counts, an estimate, time
```

Ollama reports how many tokens it actually read (`prompt_eval_count`) and wrote
(`eval_count`). The page shows those beside the `characters / 4` estimate.

## How we implemented it

### Backend (`backend/src/modules/fundamentals/`)

| File | What it does |
| --- | --- |
| `sampling.js` | Validates the request: prompt required and at most 4000 characters, temperature 0–2, top-p 0–1, max tokens a whole number 1–512, optional seed. Also holds the token estimate. |
| `complete.js` | Sends one non-streaming request to Ollama's chat endpoint with those settings and returns text, token counts, and generation time. The HTTP client is passed in, so tests never call a real model. |
| `router.js` | `POST /complete`. Validates first, so a bad setting never spends a generation. |
| `index.js` | The module definition the platform mounts at `/api/fundamentals`. |

It calls Ollama's HTTP API directly instead of going through LangChain, so you can see
exactly which settings reach the model.

### Frontend (`frontend/src/modules/fundamentals/FundamentalsPage.jsx`)

A short explanation, **Precise** and **Creative** presets, fields for the system prompt
and prompt, sliders for temperature and top-p, inputs for max tokens and seed, and the
last six runs listed with their settings, token counts, and time.

## API

`POST /api/fundamentals/complete`

```json
{
  "prompt": "Invent a one-sentence tagline for a neighborhood coffee shop.",
  "system": "Answer in one sentence.",
  "temperature": 0.8,
  "topP": 0.9,
  "maxTokens": 64,
  "seed": 7
}
```

Only `prompt` is required. Defaults: temperature 0, top-p 0.9, max tokens 128, no seed.

Returns:

```json
{
  "text": "\"Where every cup is a warm welcome to the neighborhood.\"",
  "model": "llama3.2:1b",
  "settings": { "prompt": "...", "temperature": 0, "topP": 0.9, "maxTokens": 32, "seed": 1 },
  "tokens": { "prompt": 39, "completion": 13, "estimated": 30 },
  "durationMs": 588
}
```

Invalid settings return 400 with a message, for example
`{ "error": "temperature must be a number between 0 and 2" }`.

## Test plan

### Automated tests

Run from `backend/`:

```bash
npm test
```

None of these need Ollama. The completer tests replace the HTTP call with a fake that
returns a canned Ollama response.

| File | What it checks |
| --- | --- |
| `tests/modules/fundamentals/sampling.test.js` | The estimate uses 4 characters per token and never reports 0; defaults are temperature 0, top-p 0.9, 128 tokens; system prompt and seed are kept; a missing prompt, temperature above 2, fractional max tokens, or a prompt over 4000 characters is rejected. |
| `tests/modules/fundamentals/complete.test.js` | The request sent to Ollama has the right model, `stream: false`, and options (`temperature`, `top_p`, `num_predict`, `seed`); real token counts and duration are returned; an unreachable Ollama gives a clear error; the route passes validated settings to the completer and returns 400 for a bad temperature without calling it. |

### Manual tests

Start the backend and frontend and open **LLM Fundamentals**.

| Step | Expected result |
| --- | --- |
| Click **Precise**, then **Run** twice | Both runs show the same answer, labeled temperature 0 · seed 1 |
| Click **Creative**, then **Run** twice | The two answers differ; the label says no seed |
| Keep temperature 1.2, set seed 7, **Run** twice | The answers match again |
| Set max tokens to 5 and run | The answer stops after a few words, often mid-sentence |
| Add the system prompt "Answer in exactly three words." | The answer follows the instruction, more reliably at low temperature |
| Compare **estimate** with **prompt + completion** in the footer | They differ. In a verified run: 39 prompt + 13 completion tokens, estimate 30 |
| Clear the prompt | **Run** is disabled |

To check validation without the UI, from PowerShell (`curl.exe`, because plain `curl`
there is an alias for a different command):

```powershell
curl.exe -s -X POST http://localhost:5000/api/fundamentals/complete -H "Content-Type: application/json" -d '{\"prompt\":\"hi\",\"temperature\":9}' -w "  HTTP %{http_code}"
```

Expected output: `{"error":"temperature must be a number between 0 and 2"}  HTTP 400`.

## Known limitations

- **The token estimate is a guess.** It shows how wrong the rule of thumb is, but a real
  tokenizer is a later slice.
- **One request per run.** No side-by-side comparison yet, so repeat runs to compare.
- **No streaming.** Each run waits for the full answer.
- **Only one model** at a time: the `CHAT_MODEL` set in `backend/.env`.

## Experiments

1. Run the same prompt at temperature 0, 0.7, 1.2, and 2.0. Note where answers stop
   making sense.
2. Set top-p to 0.1 at temperature 1.2. Compare with top-p 1.0 at the same temperature.
3. Paste a paragraph, a block of code, and a line of non-English text. Compare the
   estimate with the real count for each.
4. Try "Answer with only yes or no" as the system prompt, then ask something
   open-ended. See how well a small model follows it.
