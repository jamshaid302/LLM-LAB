# Security module

**Status:** ready · **UI:** sidebar → Production → Security · **API prefix:** `/api/security`

## What this module is about

A client can call the model or upload files in a loop, and one person must not read another person's files. This module is the login and the budget.

**What you learn here:** an account, a session that logout can drop, a token on every change, and which routes are expensive enough to count.

## How it works

```
POST /api/security/register or /login
  → a random session id is stored in this process
  → the browser gets an HttpOnly session cookie and a second token
  → a change sends that token back in X-CSRF-Token
  → the session replaces any X-User-Id header
  → ask, stream, or upload count against that person
  → no cookie: HTTP 401
  → cookie without the token: HTTP 403
  → logout or a password change deletes the session
  → over the count: HTTP 429 and Retry-After
```

## Local and Guest

Local and Guest are two built-in accounts with the same powers. The lab has both so you can log in as one, upload a file or start a chat, then log in as the other and see that the private data is gone. Guest is not a reduced mode. A person you create with **Create an account** works the same way.

| | Local | Guest | An account you create |
| --- | --- | --- | --- |
| Id and starting password | `local` / `local` | `guest` / `guest` | The id and password you choose |
| When it appears | Startup, if the account is missing | Startup, if the account is missing | When registration succeeds |
| Own files | `docs/users/local/` | `docs/users/guest/` | `docs/users/<id>/` |
| Own chats | Threads for `local` | Threads for `guest` | Threads for that id |
| Budget | 20 requests / 60 seconds | Its own 20 / 60 seconds | Its own 20 / 60 seconds |

Shared samples in the docs folder stay visible to every account and cannot be removed. Search returns those samples plus only the signed-in account's chunks, in the memory store and in Chroma. Another account's thread is hidden, and opening it is a 404.

`LAB_LOCAL_PASSWORD` and `LAB_GUEST_PASSWORD` set the starting passwords only when that account does not exist yet. A password saved on this page replaces that. Eight failed logins from one address in a minute return 429.

Accounts are stored in MongoDB when it is reachable, and in memory when it is not. Sessions live in this process. A restart drops every session. A restart keeps accounts only when MongoDB saved them.

List, delete, retry, and re-ingest are not counted. The request counts live in this process.

## How we implemented it

The guard is registered in `createApp` before the module routers. This module does not import RAG.

| File | What it does |
| --- | --- |
| `routes.js` | The six routes that count. |
| `limit.js` | The window, the three buckets, and the 429 response. |
| `accounts.js` | Register, password check, and password change. Random salt per password. |
| `session.js` | The session id, logout, and the two cookies. |
| `login-limit.js` | Failed logins and registrations, counted by address. |
| `router.js` | Register, login, logout, session, password change, and `GET /` for the limit. |
| `index.js` | Module id `security`. Exposes `guard` and `auth`. Loads accounts from MongoDB on startup. |

### Frontend (`frontend/src/modules/security/SecurityPage.jsx`)

The page loads `GET /api/security` and shows the budget, the login limit, and a password change form. Saving a password logs you out.

The login screen can create an account. After that, the header shows the account id. Every page sends the security token with a change.

## API

`GET /api/security` returns `limit`, `windowMs`, `routes`, and `note`.

A counted request over the budget is HTTP 429:

```json
{ "error": "Too many requests", "retryAfter": 60 }
```

The response also sets `Retry-After` in seconds.

## Test plan

### Automated tests

Run from `backend/`:

```bash
npm test
```

| File | What it checks |
| --- | --- |
| `tests/modules/security/limit.test.js` | The third request in a window of 2 is HTTP 429. The next window allows a request. Local, Guest, and unknown ids do not share a count. Unknown ids share one count. List, retry, re-ingest, and evaluation are not counted. Upload is. |
| `tests/modules/security/session.test.js` | Login sets a cookie. A route without it is 401. A change without the security token is 403. A spoofed user header does not change the person. |
| `tests/modules/security/accounts.test.js` | Register creates a person and logs them in. Logout makes the old cookie fail. A password change does too. A burst of failed logins is 429. |

| `tests/live/mongo-accounts.live.test.js` (`npm run test:live`) | Against the real MongoDB from `docker compose up -d`: a registered account survives a restart, stored as a salted hash with no plain password; a password change survives a restart; Local and Guest are seeded once and a changed password is not overwritten. It uses a separate `lab_live_*` database and drops it. |

The unit tests mount stub routes. None of these call Ollama.

### Manual tests

The full lab, in order, is in [docs/test-plan.md](../../../../docs/test-plan.md).

| Step | Expected result |
| --- | --- |
| Open **Security** | The page shows 20 requests / 60 seconds, the failed-login limit, and a password form |
| Create an account named `sam` with a password of at least 4 characters, then upload `sam-note.md` | The file is listed for `sam` and is not listed after you log in as Local |
| Log out, then log in as `sam` with a wrong password | "Unknown person or password". No page loads |
| Log in with the right password and ask a question on **RAG** | The answer and its sources appear as `sam` |
| Log out and open any page | The login form. `GET /api/security/session` and `GET /api/rag/documents` both answer 401 |

On 29 October 2026 these rows were run in the browser against the dev servers, with
Chroma and MongoDB in Docker, using throwaway accounts that were deleted afterward. One
registration answered HTTP 500 while the API was restarting under `node --watch`; the
account had been created, and the next registration and direct API calls returned 200.

## Known limitations

- **This is a lab login, not a company directory.** There is no email reset, no second factor, and no way to delete an account from the page. Passwords use a random salt. The session cookie is HttpOnly and `SameSite=Lax`. `Secure` is added only when the request is HTTPS, so `http://localhost` still works.
- **Sessions are in this process.** Logout deletes the id. A copied cookie fails after logout, a password change, or a restart.
- **Accounts survive a restart only when MongoDB is up.** Otherwise they are created again from the two lab passwords, and a new account disappears.
- **Re-ingest, evaluation, agents, hallucination, fundamentals, and providers are not counted.**
- **The count is in memory.** A restart clears it. It is not shared across processes.
