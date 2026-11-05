# LLM Fundamentals module

**Status:** ready · **UI:** sidebar → Foundations → LLM Fundamentals · **API prefix:** `/api/fundamentals`

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

A **prompt pattern** is a way of writing that input so the answer is more useful, without
changing the model or the sampling settings:

- **Zero-shot.** The task alone. No examples, no format. This is the baseline.
- **Role.** A system prompt that assigns a job and a required shape.
- **Few-shot.** Two finished examples of the shape you want, then the new task. The model
  continues the pattern it just saw.
- **Chain-of-thought.** Ask for the reasoning first and the answer last. Small models
  skip steps unless you tell them not to. The cost is more tokens.

**What you learn here:** why the same prompt gives different answers, how to make output
repeatable, why "characters divided by 4" is only a rough token estimate, and how the
wording of a prompt changes the answer when sampling is held still.

**Covered:** sampling settings, token counts, the four prompt patterns, and structured JSON
with one retry. A real tokenizer and a context-window demo are still open experiments,
not separate modules.

## How it works

Sampling, one prompt:

```
playground form
   → POST /api/fundamentals/complete
   → sampling.js     validate prompt and settings; reject bad values with a 400
   → complete.js     call Ollama's /api/chat with temperature, top_p, num_predict, seed
   → response        answer text, the settings used, real token counts, an estimate, time
```

Prompt patterns, one task compared four ways:

```
task + the same sampling settings
   → POST /api/fundamentals/patterns
   → prompts.js      build zero-shot, role, few-shot, and chain-of-thought messages
   → complete.js     call Ollama once per pattern, sequentially, with identical options
   → response        four answers, each with the exact messages that were sent
```

Holding temperature and seed still is the point. If temperature is high, you cannot tell
whether a different answer came from the prompt or from the sampling.

Structured output, same task, forced into data:

```
task, temperature 0
   → POST /api/fundamentals/structured
   → structured.js   look for a JSON object and check sentiment + nextStep
   → if invalid      send the error back once and generate again
   → if still invalid return 422 and data: null
   → if valid        return the object, and whether a retry was needed
```

Ollama reports how many tokens it actually read (`prompt_eval_count`) and wrote
(`eval_count`). The page shows those beside the `characters / 4` estimate.

## How we implemented it

### Backend (`backend/src/modules/fundamentals/`)

| File | What it does |
| --- | --- |
| `sampling.js` | Validates a completion: prompt required and at most 4000 characters, temperature 0–2, top-p 0–1, max tokens a whole number 1–512, optional seed. Also holds the token estimate. |
| `prompts.js` | Builds the four message lists. The task is always the last user turn. Few-shot inserts two fixed examples before it. Unknown patterns and empty tasks are rejected. |
| `structured.js` | Finds a JSON object in a reply, including a markdown fence, and checks `sentiment` and `nextStep`. Also builds the one-shot correction message. |
| `complete.js` | `complete` sends one prompt. `comparePatterns` runs all four patterns with one shared set of sampling settings. `extractStructured` generates, validates, and retries once. The HTTP client is passed in, so tests never call a real model. |
| `router.js` | `POST /complete`, `POST /patterns`, and `POST /structured`. A bad setting is rejected before the model is called. `/structured` returns 422 when both attempts fail. |
| `index.js` | The module definition the platform mounts at `/api/fundamentals`. |

It calls Ollama's HTTP API directly instead of going through LangChain, so you can see
exactly which messages and settings reach the model.

### Frontend (`frontend/src/modules/fundamentals/FundamentalsPage.jsx`)

Two sections on one page.

The first is the sampling playground: a short explanation, **Precise** and **Creative**
presets, system prompt, prompt, sliders, and the last six runs with token counts.

The second is prompt patterns: a task, a **Compare patterns** button, and four cards.
Each card shows the answer, the token count, and a "Prompt sent" disclosure with the
exact messages. Both sections share the sampling controls.

The third section, **Extract JSON**, reuses the task. It always sends temperature 0.
The card shows the parsed fields, or the rejection, and each raw attempt.

## API

`POST /api/fundamentals/complete`

```json
{
  "prompt": "Invent a one-sentence tagline for a neighborhood coffee shop.",
  "system": "Answer in one sentence.",
  "temperature": 0,
  "topP": 0.9,
  "maxTokens": 64,
  "seed": 1
}
```

Only `prompt` is required. Defaults: temperature 0, top-p 0.9, max tokens 128, no seed.

Returns `text`, `model`, `settings`, `tokens.prompt`, `tokens.completion`,
`tokens.estimated`, and `durationMs`.

Invalid settings return 400, for example
`{ "error": "temperature must be a number between 0 and 2" }`.

`POST /api/fundamentals/patterns`

```json
{
  "task": "A customer wrote: \"The app crashed twice and nobody replied for three days.\" What is the sentiment, and what should support do next?",
  "temperature": 0,
  "topP": 0.9,
  "maxTokens": 160,
  "seed": 1
}
```

`task` is required and at most 2000 characters. Sampling fields use the same rules as
`/complete`.

Returns `task`, `model`, the shared `settings`, and `runs`. Each run has `pattern`
(`zero-shot`, `role`, `few-shot`, or `chain-of-thought`), `label`, `messages`, `text`,
`tokens`, and `durationMs`.

`POST /api/fundamentals/structured`

```json
{ "task": "The app crashed twice and nobody replied for three days.", "temperature": 0, "seed": 1 }
```

`task` is required. The UI always sends temperature 0 for this call.

A valid reply returns 200:

```json
{
  "ok": true,
  "retried": false,
  "data": { "sentiment": "negative", "nextStep": "Email the customer today." },
  "error": null,
  "attempts": [{ "text": "{\"sentiment\":\"negative\",\"nextStep\":\"Email the customer today.\"}", "ok": true, "error": null }]
}
```

If the first reply is prose and the second is valid, `retried` is true and `attempts` has
two entries. If both fail, the status is 422, `ok` is false, and `data` is null. The
body still includes both raw attempts.

## Test plan

### Automated tests

Run from `backend/`:

```bash
npm test
```

None of these need Ollama. The runner tests replace the HTTP call with a fake that
returns a canned Ollama response.

| File | What it checks |
| --- | --- |
| `tests/modules/fundamentals/sampling.test.js` | The estimate uses 4 characters per token and never reports 0; defaults are temperature 0, top-p 0.9, 128 tokens; system prompt and seed are kept; a missing prompt, temperature above 2, fractional max tokens, or a prompt over 4000 characters is rejected. |
| `tests/modules/fundamentals/prompts.test.js` | Zero-shot is the task alone. Role adds a system prompt that names the `Sentiment:` shape. Few-shot has two assistant examples and the task as the last user turn, not inside an example. Chain-of-thought asks for step-by-step reasoning and an `Answer:` line. An unknown pattern and an empty task are rejected. All four patterns share the same task. |
| `tests/modules/fundamentals/complete.test.js` | The request sent to Ollama has the right model, `stream: false`, and options. Real token counts and duration are returned. An unreachable Ollama gives a clear error. `/complete` passes validated settings through and returns 400 for a bad temperature without calling the model. `/patterns` calls the model four times with identical sampling options and the task as the last message. A missing task returns 400 and never calls the model. |
| `tests/modules/fundamentals/structured.test.js` | Raw JSON and fenced JSON parse. Prose, a bad sentiment, and a missing `nextStep` do not. A valid first reply does not retry. An invalid first reply is sent back once with the error text, and the second object is kept. Two failures return `data: null` and call the model exactly twice. `/structured` returns 422 in that case. A missing task returns 400 and never calls the model. |

### Manual tests

The full lab, in order, is in [docs/test-plan.md](../../../../docs/test-plan.md). The rows below are this module.

Start the backend and frontend and open **LLM Fundamentals**.

Sampling:

| Step | Expected result |
| --- | --- |
| Click **Precise**, then **Run** twice | Both runs show the same answer, labeled temperature 0 · seed 1 |
| Click **Creative**, then **Run** twice | The two answers differ; the label says no seed |
| Keep temperature 1.2, set seed 7, **Run** twice | The answers match again |
| Set max tokens to 5 and run | The answer stops after a few words, often mid-sentence |
| Add the system prompt "Answer in exactly three words." | The answer follows the instruction, more reliably at low temperature |
| Compare **estimate** with **prompt + completion** in the footer | They differ. In a verified run: 39 prompt + 13 completion tokens, estimate 30 |
| Clear the prompt | **Run** is disabled |

Prompt patterns. Set temperature to 0, seed to 1, and max tokens to at least 160 first.

| Step | Expected result |
| --- | --- |
| Click **Compare patterns** on the default task | Four cards: Zero-shot, Role, Few-shot, Chain-of-thought. This takes longer than one run, because it is four generations |
| Read Role and Few-shot | Both tend to use `Sentiment:` and `Next step:`. Zero-shot is a paragraph with no fixed shape |
| Open **Prompt sent** on Few-shot | Two example exchanges appear before the task. The task is the last user message |
| Open **Prompt sent** on Chain-of-thought | The system message asks for reasoning and a final `Answer:` line. The answer is longer than the others |
| Click **Compare patterns** again without changing anything | The four answers match the first comparison, because temperature is 0 and the seed is set |
| Raise temperature to 1.2, clear the seed, compare twice | Answers move around. You can no longer tell the prompt effect from the sampling effect |
| Clear the task | **Compare patterns** and **Extract JSON** are disabled |

Structured output. The button forces temperature 0 even if the slider is higher.

| Step | Expected result |
| --- | --- |
| Click **Extract JSON** on the default complaint | A card titled **Valid object** with `sentiment: negative` and a next step. **first try** if the model obeyed, **retried once** if it needed the correction |
| Open the attempt | The raw text is JSON, or prose followed by a corrected JSON attempt |
| The object is shown only when the card says **Valid object** | A rejected run shows the error and no sentiment field |

To check validation without the UI, from PowerShell (`curl.exe`, because plain `curl`
there is an alias for a different command):

```powershell
curl.exe -s -X POST http://127.0.0.1:5001/api/fundamentals/complete -H "Content-Type: application/json" -d '{"prompt":"hi","temperature":9}' -w "  HTTP %{http_code}"
```

Expected output: `{"error":"temperature must be a number between 0 and 2"}  HTTP 400`.

```powershell
curl.exe -s -X POST http://127.0.0.1:5001/api/fundamentals/patterns -H "Content-Type: application/json" --data-raw "{}" -w "  HTTP %{http_code}"
```

Expected output: `{"error":"Missing 'task'"}  HTTP 400`.

```powershell
curl.exe -s -X POST http://127.0.0.1:5001/api/fundamentals/structured -H "Content-Type: application/json" --data-raw "{}" -w "  HTTP %{http_code}"
```

Expected output: `{"error":"Missing 'task'"}  HTTP 400`.

## Known limitations

- **The token estimate is a guess.** It shows how wrong the rule of thumb is. A real tokenizer is a later slice.
- **The four patterns are fixed.** You cannot edit the role text or the examples in the UI. They live in `prompts.js` so the comparison stays stable.
- **Comparison is sequential.** Four calls, one after another, so a slow model makes this button wait.
- **No streaming.** Each run waits for the full answer.
- **One schema.** This slice validates a support ticket only. A second schema would be the same parser with different field checks.
- **One retry.** A third call would cost more and rarely fix a model that ignored two instructions.
- **Only one model** at a time: the `CHAT_MODEL` set in `backend/.env`.

## Experiments

1. Run the same tagline prompt at temperature 0, 0.7, 1.2, and 2.0. Note where answers stop making sense.
2. Set top-p to 0.1 at temperature 1.2. Compare with top-p 1.0 at the same temperature.
3. Compare patterns on the default complaint, then rewrite the task as a happy review. See whether few-shot still produces `Sentiment: positive`.
4. Set max tokens to 30 and compare again. Chain-of-thought is the one that gets cut off, because the reasoning spends the budget before the answer.
5. Try "Answer with only yes or no" as the system prompt on an open question. See how well a small model follows it.
6. Click **Extract JSON**, then set temperature to 1.2 and use **Run** with the system prompt "Reply with JSON". The sampling playground will not parse it. That is the difference between asking for JSON and validating it.
