# AI agents module

**Status:** ready · **UI:** sidebar → Agents → AI Agents · **API prefix:** `/api/agents`

## What this module is about

The model names one function. This API runs it and sends the result back. The model does not read the files itself.

**What you learn here:** a tool call, a loop that stops, and a result you can grade: finished or not, how many steps, and whether the arguments were valid.

## How it works

```
Run
  → POST /api/agents/run { task }
  → the agent model may call search_documents { query }
  → this API searches, fences the chunks, and sends them back
  → the model answers in plain text
  → stop at 4 steps or 3 minutes
```

`search_documents` is the Semantic Search lookup: top k, then the score cutoff, limited to the shared samples plus the person in Who is asking. An unknown tool name, or a query that is missing, is rejected and the search does not run. The model can try again until the cap.

The agent model is `AGENT_MODEL`, default `qwen2.5:7b`. The chat model can stay smaller.

## How we implemented it

This module does not import RAG. `backend/src/modules/index.js` passes a search function that calls `ragService.retrieve` and the cutoff.

| File | What it does |
| --- | --- |
| `loop.js` | The loop, the tool schema, argument checks, and the step and time caps. |
| `ollama-tools.js` | One Ollama chat call with the tool list, at temperature 0. |
| `service.js` | Checks the task, then runs the loop. |
| `router.js` | `POST /run`. Reads `X-User-Id`. |
| `index.js` | Module id `agents`. Health reports the tool name, the step cap, and the model. |

### Frontend (`frontend/src/modules/agents/AgentsPage.jsx`)

**Run** shows the model, whether the run finished, the step count, whether the arguments were valid, the answer, and each tool call with the query and the kept file names and scores.

## API

`POST /api/agents/run` body: `{ "task": "Where is the company gym?" }`.

The JSON includes `model`, `finished`, `stopped` (`null`, `"steps"`, or `"time"`), `steps`, `maxSteps`, `argumentsValid` (`true`, `false`, or `null` when no tool was called), `answer`, and `toolCalls`. Each call has `name`, `arguments`, `valid`, and, when the search ran, `sources` as `{ source, score }`. Chunk text stays out of that list. A blank task, a task over 4000 characters, or an unknown `X-User-Id` is HTTP 400.

## Test plan

### Automated tests

Run from `backend/`:

```bash
npm test
```

| File | What it checks |
| --- | --- |
| `tests/modules/agents/loop.test.js` | A known tool call searches and the response omits chunk text. An unknown tool does not search. The step cap and the time cap stop the loop. Guest is passed into search. A blank task and an unknown user are HTTP 400. The Ollama request includes the tool and temperature 0. |

The loop tests use a fake model. They do not call Ollama.

### Manual tests

The full lab, in order, is in [docs/test-plan.md](../../../../docs/test-plan.md).

| Step | Expected result |
| --- | --- |
| Run `Where is the company gym?` | Finished is yes. Arguments are valid. The tool is `search_documents`. Kept names `knowledge.txt`. The answer mentions the 3rd floor |

## Known limitations

- **One tool.** There is no second function, and no handoff to another agent.
- **The check is the tool call, not a judge.** A run can finish with a weak sentence. The record still shows the query and the files that were kept.
- **The trace log does not store agent runs.** Observability covers RAG and chat only.
