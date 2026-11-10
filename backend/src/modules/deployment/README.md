# Deployment module

**Status:** ready · **UI:** sidebar → Production → Deployment · **API prefix:** `/api/deployment`

## What this module is about

The API process can run in a container. The models stay where they already are.

**What you learn here:** an image for one process, Compose for the databases, and a workflow that runs the tests you already have.

## How it works

```
docker compose up -d
  → Chroma and Mongo only

docker compose --profile api up -d --build
  → those two, plus the API image on port 5001
  → Ollama is http://host.docker.internal:11434

docker compose --profile api --profile web up -d --build
  → the API, plus the frontend image on port 8080
```

Day to day, `npm run dev` is still the way to work. Stop that process before the API profile, because both want port 5001.

Inside the Compose network the API uses `http://chroma:8000` and `mongodb://mongo:27017/lab`. A container cannot use `localhost` for the host's Ollama.

The cross-encoder reranker is not baked into the image. The first question after a fresh
container downloads it (about 23 MB) from huggingface.co into `/app/.cache/models`. The
`model-cache` volume keeps it, so later containers load it in about 2 seconds instead of
about 20. A machine with no internet access needs the three files copied into that
volume, or `RAG_RERANK=off`; without them, retrieval falls back to vector order and the
trace says why.

## How we implemented it

| File | What it does |
| --- | --- |
| `backend/Dockerfile` | Node 22 image. Production dependencies, then `src`. Creates `/app/.cache/models` for the reranker. Runs as the `node` user. |
| `backend/docker-compose.yml` | Chroma and Mongo as before. The `api` service is behind the `api` profile and mounts the `model-cache` volume. |
| `frontend/Dockerfile` | Builds the React app and serves it with nginx. `/api` is proxied to the API service. |
| `.github/workflows/test.yml` | Three jobs on push and pull request. `backend`: `npm test`, which includes the quality gate on `baseline.json`. `live`: starts `mongo:7` and `chromadb/chroma:1.4.1` as services, waits for Chroma's heartbeat, and runs `npm run test:live`. `image`: builds both images. |
| `router.js` | `GET /` returns the image path, the workflow path, and the URLs this process is using. |

### Frontend (`frontend/src/modules/deployment/DeploymentPage.jsx`)

The page loads `GET /api/deployment` and shows the image, the workflow, and the Ollama URL.

## API

`GET /api/deployment` returns `image`, `workflow`, `ollama`, `store`, `chroma`, `mongo`, and `note`.

## Test plan

### Automated tests

Run from `backend/`:

```bash
npm test
```

| File | What it checks |
| --- | --- |
| `tests/modules/deployment/info.test.js` | The route names the Dockerfile and the test workflow. |

The test does not build the image and does not call Ollama.

### Manual tests

The full lab, in order, is in [docs/test-plan.md](../../../../docs/test-plan.md).

| Step | Expected result |
| --- | --- |
| Open **Deployment** | The card names `backend/Dockerfile` and `.github/workflows/test.yml`. Ollama is an `http` URL |
| From `backend/`, with `docker compose up -d` running: `npm run test:live` | 14 tests pass: Chroma owner filtering, accounts, traces, and the external embed worker against the real services. Afterward no `lab_live_*` database or live Chroma collection is left |
| `docker build -t lab-api backend`, then run the reranker once inside it (command below) | Two scores; the gym sentence scores far higher than the unrelated one |

```bash
docker run --rm lab-api node -e "import('/app/src/core/cross-encoder.js').then(async (m) => { const e = m.createCrossEncoder({ model: 'Xenova/ms-marco-MiniLM-L-6-v2' }); console.log(await e.score('Where is the company gym?', ['The company gym is located on the 3rd floor.', 'Pets are allowed on Fridays.'])); })"
```

On 29 October 2026 that printed `[ 9.0, -11.3 ]` (rounded) after a 15-second first load.
With a named volume mounted at `/app/.cache`, a second container loaded it in 1.9 seconds.

## Known limitations

- **A chat call times out after 120 seconds and is tried once more.** A 400 and a stop from the caller are not retried. A token that already reached the browser is not sent again.
- **CI checks saved quality numbers, not live ones.** CI has no Ollama, so it cannot rerun the question set. It checks the committed `baseline.json` against the floors in `backend/src/modules/rag/eval/gate.js`. Whoever changes retrieval or prompts runs `npm run eval:retrieval -- --write` and `npm run eval:answers -- --model qwen2.5:7b --write` and commits the result.
- **The images are built, not pushed.** There is no registry, no hosting target, and no secrets in the workflow.
