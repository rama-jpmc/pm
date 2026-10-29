# Code review

Full-repo review of the Project Management MVP (backend, frontend, Docker/deploy, tests, docs) as of the current `main` branch. Findings are ordered by severity within each section; each includes the affected file(s) and a concrete recommended action.

**Status:** all five steps of the "Suggested action order" are complete — items #1-#6, #8-#11, and #14 have been fixed and verified (see the "Resolved" note under each). #7 (no real auth) and #13 (no logout/session persistence) are now also resolved, by the later multi-user/multi-board/collaboration work (see their notes below) — this doc just hadn't been updated to say so. Remaining open item: #12 (Dockerfile not using `uv`); #15 (sync blocking calls) remains an accepted fine-at-MVP-scale tradeoff, not a defect.

All Critical and Medium findings (#1-#9) are resolved. Nothing above Low/nits severity remains open.

## Summary

The MVP's core loop (mock login, board CRUD, drag-and-drop, SQLite persistence) is solid and covered by passing tests. The AI chat feature, however, is very likely non-functional against the real OpenRouter API today, for two independent reasons (wrong endpoint URL, and the API key never actually reaching the process environment) — see Critical #1 and #2. There's also a packaging gap (no `.dockerignore`) that risks baking a local secrets file into a Docker image, and a data-hygiene issue (the SQLite database is committed to git). Everything else is moderate/minor: some overly permissive CORS config, a state-sync bug between the board view and what the chat sidebar sends to the AI, hardcoded API base URLs duplicated across files, and a couple of stale docs / stray tracked files.

None of this blocks the current PoC's stated success criteria (login, board CRUD, drag-and-drop, persistence all work and are tested). The AI chat findings matter because `docs/PLAN.md` currently marks Parts 8-10 as functionally complete.

## Critical

### 1. OpenRouter request URL is almost certainly wrong
`backend/app/main.py:201` posts to `https://api.openrouter.ai/v1/chat/completions`. OpenRouter's documented API lives at `https://openrouter.ai/api/v1/chat/completions` — a different domain (`openrouter.ai`, not `api.openrouter.ai`) with `/api/v1` rather than `/v1`. As written, every real chat request will fail to resolve/route correctly, which the test suite can't catch because `test_chat_endpoint_parses_ai_response` mocks `httpx.post` directly rather than hitting a real (or even a fake HTTP server at) URL.
**Action:** change the URL to `https://openrouter.ai/api/v1/chat/completions` and add one test that asserts the URL passed to `httpx.post` (currently nothing pins that down).

**Resolved:** URL fixed in `backend/app/main.py`. Verified with a live `POST /api/chat` call against the real OpenRouter API (200 response with a real assistant reply). The regression test asserting the request URL is still outstanding.

### 2. OPENROUTER_API_KEY is never actually loaded into the process environment
`AGENTS.md` says the key lives in `.env` at the project root, and `backend/app/main.py:172` reads it via `os.environ.get("OPENROUTER_API_KEY")`. But nothing in the codebase loads a dotenv file (no `python-dotenv` in `backend/requirements.txt`, no `load_dotenv()` call), `scripts/start.sh` doesn't source anything before launching uvicorn, and `docker-compose.yml` only sets `PYTHONUNBUFFERED=1` — it never passes `OPENROUTER_API_KEY` through to the container. Combined with #1, chat is effectively guaranteed to fail (`HTTPException(500, "OPENROUTER_API_KEY is not configured")`) in every documented way of running this app, unless someone manually `export`s the variable in their shell first.

Separately: the actual local secrets file at the repo root is named `.venv` (a highly confusing name — `.venv` conventionally means a Python virtualenv directory, and one already exists here as `.venv-1`), not `.env` as AGENTS.md describes. That mismatch is probably *why* nothing loads it.
**Action:** pick one real mechanism — either add `python-dotenv` and call `load_dotenv()` at startup, or add `env_file: .env` (or explicit `environment:` passthrough) to `docker-compose.yml` and document exporting the var for local `scripts/start.sh` runs. Rename the secrets file to `.env` to match `AGENTS.md` and what tooling conventionally expects. It contains keys unrelated to this project's stated stack (OpenAI, Anthropic, alongside OpenRouter) — trim it to just what this project uses, and rotate any of those keys that may be shared with other local projects, since a plaintext multi-provider secrets file sitting outside of any single project's control is easy to leak by accident.

**Resolved:** added `python-dotenv` (`backend/requirements.txt`) and a `load_dotenv(PROJECT_ROOT / ".env")` call in `backend/app/main.py`, covering local (`scripts/start.sh`) runs; added `env_file: .env` to `docker-compose.yml` for the container path. Created a project-root `.env` with just `OPENROUTER_API_KEY` (confirmed gitignored, not committed). The original `.venv` file was left untouched — the OpenAI/Anthropic key cleanup and rotation is still up to you.

### 3. No `.dockerignore` — `COPY . .` pulls in everything, including local secrets
The `Dockerfile` (`backend/../Dockerfile:16`) does `COPY . .` with no `.dockerignore` anywhere in the repo. Docker's build context is governed by `.dockerignore`, not `.gitignore`, so a local build will copy `.git/` (full history), `.venv`/`.venv-1`, `frontend/node_modules` (if present locally), `frontend/out`, `frontend/.next`, and `backend/data/kanban.db` into the build context and potentially into image layers — bloating the image and risking a locally-present secrets file ending up baked into a shipped image.
**Action:** add a `.dockerignore` at the repo root excluding at minimum: `.git`, `.venv*`, `**/node_modules`, `frontend/.next`, `frontend/out`, `backend/data`, `**/__pycache__`, `**/.pytest_cache`, `frontend/test-results`.

**Resolved:** added `.dockerignore` at the repo root covering `.git`, `.venv`/`.venv-1`, `.env`, `node_modules`, `frontend/.next`, `frontend/out`, `frontend/test-results`, `frontend/coverage`, `backend/data`, `__pycache__`, `.pytest_cache`, and `docs`.

### 4. SQLite database is committed to git
`backend/data/kanban.db` is tracked in git (confirmed via `git ls-files`) and shows up as `modified` after simply running the test suite or starting the app once. Committing a binary database file means every run of the app or its tests dirties the working tree and pollutes history with binary diffs; it also risks committing whatever test/demo data happens to be in it at commit time.
**Action:** `git rm --cached backend/data/kanban.db` and add `backend/data/*.db` (or `backend/data/`) to the root `.gitignore`. `init_db()` already recreates the schema automatically on first run, so nothing depends on the file being present in a fresh checkout.

**Resolved:** ran `git rm --cached backend/data/kanban.db` (file kept on disk, only untracked) and added `backend/data/` to the root `.gitignore`. Staged, not committed — review and commit when ready.

## Medium

### 5. Chat sidebar can reason about a stale/empty board for first-time users
`frontend/src/app/page.tsx` seeds `board` as `{columns: [], cards: {}}` and only updates it from the `GET /api/board` response. `backend/app/main.py:138-142` returns exactly that empty shape for a user with no saved board yet. Meanwhile `KanbanBoard.tsx:27-32` privately falls back to the demo `initialData` (5 populated columns) whenever the board it's handed is empty — but that fallback only updates `KanbanBoard`'s own internal state; it's never reported back up to `page.tsx` via `onBoardChange` (that only fires from user-initiated actions in `updateBoard`, `KanbanBoard.tsx:53-59`). Until the user drags/renames/adds/deletes something, `page.tsx`'s `board` state — and therefore what `ChatPanel` sends as board context to the AI — stays `{columns: [], cards: {}}`, even though the screen is showing 5 populated columns. Any AI request made before the user's first board edit will be reasoning about a board the user doesn't actually see.
**Action:** lift the `initialData` fallback out of `KanbanBoard` and into `page.tsx` (or have `KanbanBoard` call `onBoardChange` once on mount when it applies the fallback), so all three components (`page.tsx`, `KanbanBoard`, `ChatPanel`) agree on the same board state from the start.

**Resolved:** `page.tsx` now seeds `board` with `initialData` directly and only overrides it from the fetch when the returned board is non-empty, so `page.tsx`/`KanbanBoard`/`ChatPanel` all agree on the same board from the first render, whether or not the backend has a saved board yet. While in `KanbanBoard.tsx`, also fixed a related lint error (`react-hooks/set-state-in-effect`) surfaced by `npm run lint` in the same prop-sync code — replaced the effect-based `setBoard(initialBoard)` with React's recommended render-time state-adjustment pattern.

### 6. Overly permissive CORS config
`backend/app/main.py:46-52` sets `allow_origins=["*"]` together with `allow_credentials=True`. Nothing in this app actually uses cookies or credentialed requests (`user_id` is passed as a plain JSON field, not a session cookie), so `allow_credentials=True` buys nothing but does force Starlette into reflecting the request's `Origin` header instead of a literal wildcard, which is a more permissive posture than necessary.
**Action:** drop `allow_credentials=True` (unused), and once a deployment target is known, scope `allow_origins` to the actual frontend origin(s) instead of `"*"`.

**Resolved:** removed `allow_credentials=True` from the `CORSMiddleware` config in `backend/app/main.py`. Scoping `allow_origins` beyond `"*"` is left open until a real deployment target is known.

### 7. No real authentication on the backend
Every `/api/board` and `/api/chat` call trusts a client-supplied `user_id` with no session/token verification (`backend/app/main.py:130-231`) — anyone who can reach the backend can read or overwrite any other user's board by simply choosing their `user_id`. This is explicitly called out as an accepted MVP limitation in `AGENTS.md` ("only a user sign in hardcoded... database will support multiple users for future"), so it's not a bug relative to current scope, but it's worth flagging now since it's the most consequential thing to fix before this runs anywhere beyond a single trusted local machine.
**Action:** no change needed for the current PoC scope; when real multi-user support lands, replace the client-supplied `user_id` with a server-issued session token tied to login.

**Resolved:** real multi-user accounts landed (see `docs/PLAN.md` Parts 4-6, 13): `POST /api/auth/register`/`login` hash passwords with bcrypt and issue an opaque `secrets.token_urlsafe` session token stored in a `sessions` table; every other endpoint requires `Authorization: Bearer <token>` and resolves to a `CurrentUser` via the `get_current_user` dependency (`backend/app/main.py`) — there is no client-supplied `user_id` anywhere left to spoof. Board access is further scoped per-request via `get_owned_board_row` (owner-only: delete, manage collaborators) and `get_accessible_board_row` (owner or collaborator: read, update, chat), both returning 404/403 appropriately. Covered by backend tests for cross-user access, unauthenticated requests, and ownership enforcement.

### 8. Chat's structured-response parsing is brittle for real LLM output
`extract_json_object`/`parse_ai_response_text` (`backend/app/main.py:76-122`) find the *first* `{`...`}` blob in the model's raw text and try to parse it as the whole response. This works for the tests' hand-crafted mock output, but the OpenRouter request (`backend/app/main.py:199-213`) doesn't use a strict JSON mode / `response_format` constraint, so nothing stops the real model from prefacing its JSON with prose, or from including an unrelated `{...}` example in its explanation, both of which would either silently drop a real board update or misparse a wrong stand-in object as the board.
**Action:** once #1/#2 are fixed and the endpoint can be exercised against a live model, add `response_format: {"type": "json_object"}` (OpenRouter/OpenAI-compatible models support this) to the request payload so the model is constrained to return JSON only, simplifying the parsing.

**Resolved:** added `"response_format": {"type": "json_object"}` to the OpenRouter request payload in `backend/app/main.py`. Verified with a live `POST /api/chat` call (200, valid response) after the change. The manual brace-matching in `extract_json_object`/`parse_ai_response_text` was left in place as a defense-in-depth fallback rather than removed.

### 9. Hardcoded API base URL duplicated in three places
`API_BASE = "http://127.0.0.1:8000"` is independently defined in `frontend/src/app/page.tsx:9`, `frontend/src/components/KanbanBoard.tsx:24`, and `frontend/src/components/ChatPanel.tsx:18`. This works for the specific case where frontend and backend are both on localhost with those exact ports, but it's easy for the three to drift, and it can't be overridden per-environment without editing source.
**Action:** extract a single shared constant (e.g. `frontend/src/lib/config.ts`) or read from `process.env.NEXT_PUBLIC_API_BASE` with a localhost fallback, and import it in all three places.

**Resolved:** added `frontend/src/lib/config.ts` exporting `API_BASE` (reads `process.env.NEXT_PUBLIC_API_BASE`, falls back to `http://127.0.0.1:8000`), and updated `page.tsx`, `KanbanBoard.tsx`, and `ChatPanel.tsx` to import it instead of each defining their own copy.

## Low / nits

### 10. Playwright run artifact committed to git
`frontend/test-results/.last-run.json` is tracked in git even though `frontend/.gitignore` already covers `/coverage` and build output — `test-results/` was missed.
**Action:** `git rm --cached frontend/test-results/.last-run.json` and add `/test-results` to `frontend/.gitignore`.

**Resolved:** ran `git rm --cached frontend/test-results/.last-run.json` and added `/test-results` to `frontend/.gitignore`. Staged, not committed.

### 11. `frontend/AGENTS.md` is out of date
It lists only `page.tsx`, `KanbanBoard.tsx`, `KanbanColumn.tsx`, `NewCardForm.tsx`, and `lib/kanban.ts` under "Current structure" — it's missing `ChatPanel.tsx`, `LoginScreen.tsx`, `KanbanCard.tsx`, and `KanbanCardPreview.tsx`, all of which now exist and are tested.
**Action:** update the file list to match the current `src/components/` contents.

**Resolved:** `frontend/AGENTS.md` now lists all current components (`LoginScreen.tsx`, `KanbanCard.tsx`, `KanbanCardPreview.tsx`, `ChatPanel.tsx`) plus the new `lib/config.ts`.

### 12. Dockerfile doesn't use `uv` as instructed
`AGENTS.md` explicitly says: "Use 'uv' as the package manager for python in the Docker container." The `Dockerfile` instead does a plain `pip install --no-cache-dir -r backend/requirements.txt` (`Dockerfile:11`). Not a functional bug, but a direct deviation from a stated technical decision.
**Action:** either switch the Dockerfile to install/run via `uv`, or update `AGENTS.md` if the plain-pip approach is now the intended decision.

### 13. No session persistence / logout
Auth state lives only in React state (`frontend/src/app/page.tsx`), so a page refresh always drops back to the login screen, and there's no logout control. Likely fine for a local demo PoC, but worth a conscious decision rather than an implicit gap, especially once multi-user support (item #7) is real.

### 14. Chat parsing has no failure-mode test coverage
`backend/tests/test_api.py::test_chat_endpoint_parses_ai_response` only covers the happy path (well-formed JSON with both `assistant_message` and a valid `board`). There's no test for: a plain-text (non-JSON) assistant reply, malformed/truncated JSON, a `board` missing `columns` or `cards`, or the upstream OpenRouter call itself failing (non-200 status, connection error) — all of which have dedicated code paths in `backend/app/main.py` (`extract_json_object` returning `None`, the `httpx.HTTPError` handler, the `response.status_code != 200` branch) that currently execute only in production, never in CI.
**Action:** add 3-4 focused unit tests for these branches; they're cheap given the existing `monkeypatch.setattr(httpx, "post", fake_post)` pattern already in the file.

**Resolved:** added 7 new tests to `backend/tests/test_api.py`: correct-URL regression test (pins the fix from #1), missing API key (500), plain-text response, malformed/truncated JSON, board missing `columns`/`cards` keys, upstream connection error (502), and non-200 upstream status (502). Full suite is now 10 tests, all passing.

### 15. Sync blocking calls inside FastAPI request handlers
`chat()` and the SQLite helpers in `backend/app/main.py` are plain `def` (not `async def`), so FastAPI runs them in a threadpool — functionally fine, but the ~30s timeout on the OpenRouter call (`backend/app/main.py:212`) ties up one worker thread per concurrent chat request. Not an issue at MVP/local scale; worth knowing if this ever needs to handle concurrent users.

## Suggested action order

1. ~~Fix the OpenRouter URL and actually wire `OPENROUTER_API_KEY` through (`docker-compose.yml` + local dev), then verify one real chat round-trip manually. (#1, #2)~~ Done.
2. ~~Add `.dockerignore`; untrack `backend/data/kanban.db` and `frontend/test-results/.last-run.json`, and gitignore both. (#3, #4, #10)~~ Done.
3. ~~Fix the board state-sync gap between `page.tsx`, `KanbanBoard`, and `ChatPanel` so the AI always sees what's on screen. (#5)~~ Done.
4. ~~Quick cleanups: drop unused `allow_credentials`, dedupe `API_BASE`, refresh `frontend/AGENTS.md`. (#6, #9, #11)~~ Done.
5. ~~Once live chat is verified, add `response_format: json_object` and the missing failure-path tests. (#8, #14)~~ Done.

## Addendum: found and fixed during action 3

Not in the original review — surfaced live in the browser after the action-3 state-sync fix (React console error: "Cannot update a component ('Home') while rendering a different component ('KanbanBoard')").

`KanbanBoard.tsx`'s `updateBoard` called `onBoardChange?.(next)` (the parent `Home` component's setter) from *inside* the functional updater passed to its own `setBoard`. React runs that updater during `KanbanBoard`'s render/reconciliation, so updating a different component's state from within it is invalid — pre-existing since this call site predates today's session, just not previously triggered by the tests we run (Playwright's mouse-drag e2e test didn't happen to catch the console error; Vitest doesn't drive real drag/rename/add interactions end-to-end the way this needed).

**Resolved:** `updateBoard` now computes `next` and calls `setBoard(next)` / `onBoardChange?.(next)` directly (using the closed-over `board` value) instead of inside a `setBoard` updater callback — safe because `updateBoard` is only ever invoked from event handlers, never during render. Verified with a scripted Playwright run driving login, column rename, add-card, and drag-and-drop while listening for console errors — zero errors captured (previously reproduced the exact error from the report).

## Remaining open items

- **#12** `Dockerfile` uses plain `pip` instead of `uv`, deviating from `AGENTS.md`'s stated technical decision.
- ~~**#13** No logout / session persistence across page refresh.~~ **Resolved** by the same multi-user work as #7: `frontend/src/lib/session.ts` persists `{token, userId, username}` to `localStorage` and `page.tsx` revalidates it against `/api/auth/me` on load; a logout control calls `POST /api/auth/logout` to delete the session server-side and clears local storage. Covered by a Playwright e2e test ("signs out and returns to the login screen").
- **#15** Sync blocking calls in FastAPI handlers — fine at MVP/local scale, worth revisiting if concurrent usage grows.
