# Document pipeline module

**Status:** ready · **UI:** sidebar → Retrieval → Document Pipeline · **API prefix:** `/api/documents`

## What this module is about

A new file should not make the person wait for every chunk to be embedded. The API checks
the file, writes it, and returns while one worker embeds that file. This page is where you
watch that job.

The worker, the file rules, and the vector store belong to the RAG module. This module
calls those functions. It does not embed anything itself, and it does not import the RAG
module. `backend/src/modules/index.js` passes the functions in.

**What you learn here:** checking a file is synchronous, embedding is a job, and a failed
job can be retried from the file that is already on disk.

## How it works

```
Upload
   → POST /api/documents          check the name, write the file, enqueue
   → 202                          { filename, status: "queued", chunks: null, error: null }
   → one worker                   chunk that file and embed it
   → GET /api/documents           each row is queued, embedding, ready, or failed
```

A `.txt` or `.md` body is `{ "filename", "text" }`. A `.pdf` body is `{ "filename", "data" }`
with the original file as base64. The file must be at most 512 KB. A path, an empty file,
a PDF with no text layer, or an attempt to replace `knowledge.txt` or `office.txt` is
HTTP 400 and nothing is written.

New files go to `docs/users/<account>/`. Files already in the docs folder are shared.
Shared rows have no Remove button. In the running app the account is the session. Local and Guest have the same powers; each one sees the shared samples plus only their own uploads. A route called without a session still treats a missing `X-User-Id` as Local and rejects any other header with HTTP 400.

The RAG page uploads through `/api/rag/documents`. Both routes use the one queue inside
the API process.

## How we implemented it

| File | What it does |
| --- | --- |
| `service.js` | Lists each visible file with its job status. Upload, retry, and remove call the injected RAG functions. |
| `router.js` | `GET /`, `POST /`, `GET /:filename`, `DELETE /:filename`, `POST /:filename/retry`. |
| `index.js` | Module id `documents`. Health reports `queue: "memory"`. |

### Frontend (`frontend/src/modules/documents/DocumentsPage.jsx`)

The list loads on open and polls while any row is queued or embedding. Upload, Retry, and
Remove uses the signed-in account. Log out and log in as the other person to reload that person's list.

## API

`GET /api/documents` returns `{ "documents": [{ "name", "shared", "removable", "status", "chunks", "error" }] }`.

`status` is `queued`, `embedding`, `ready`, or `failed`. `chunks` is the store size when a
job has just finished, and `null` when the file was already in the folder. `error` is set
when the job failed.

`GET /api/documents/:filename` is that one job: `{ "filename", "status", "chunks", "error" }`.

`POST /api/documents/:filename/retry` is HTTP 202 with the queued job. The file stays on
disk. Retrying a file that is not failed is HTTP 400.

`DELETE /api/documents/:filename` removes one of this person's files and drops its chunks.
If an embed of that file is still running, the delete waits until that work finishes and
then drops the chunks. It returns `{ "filename", "chunks", "store" }`. Deleting a shared
file is HTTP 400. An unknown name is 404.

## Test plan

### Automated tests

Run from `backend/`:

```bash
npm test
```

| File | What it checks |
| --- | --- |
| `tests/modules/documents/pipeline.test.js` | An upload is HTTP 202 and then `ready`. The sample file is shared and not removable. A guest upload is absent from Local's list. Guest can delete it. An empty file and an unknown user are HTTP 400. |

These tests use a memory store and fake embeddings. They do not call Ollama.

### Manual tests

The full lab, in order, is in [docs/test-plan.md](../../../../docs/test-plan.md). The rows below are this module.

Start the API and the frontend. Open **Document Pipeline**.

| Step | Expected result |
| --- | --- |
| Read the list | `knowledge.txt`, `office.txt`, and the cent-trading notes are there. Each says `ready` and `shared`. They have no Remove button |
| Upload a small `.md` named `pipeline-note.md` whose text is `The visitor parking code is maple-17.` | The row appears as `queued` or `embedding`, then `ready` |
| Open **Semantic Search** and search `maple-17` | A kept chunk names `pipeline-note.md` |
| Return here and click **Remove** on `pipeline-note.md` | The row is gone. A notice includes the new chunk count |
| Log out and log in as Guest | `pipeline-note.md` is not listed. The shared files are |

## Known limitations

- **The queue lives in this process.** A restart drops queued and failed jobs. The saved file changes the folder hash, and startup embeds the folder again. A separate worker is not built.
- **Re-ingest still waits.** The RAG page button embeds the whole folder before it responds. This page does not re-ingest.
- **Local and Guest are accounts, not a header switch.** They have the same powers. Guest does not see Local's uploads, and neither can remove the shared samples. A new account gets its own folder too. See [Accounts: Local and Guest](../../../../README.md#accounts-local-and-guest).
