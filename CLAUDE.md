
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A Project Management app: multi-user accounts, each user owns multiple Kanban boards with drag-and-drop, backed by a FastAPI + SQLite backend, with an AI chat sidebar (OpenRouter) that can create/edit/move cards on the active board. See `AGENTS.md` for full business requirements, `docs/PLAN.md` for current implementation status, and `docs/code_review.md` for a full-repo review with a resolved/open action list.

Scope: real registration/login with hashed passwords and bearer-token sessions, unlimited boards per user, runs locally via Docker.

## Commands

### Frontend (`frontend/`)
```bash
npm install
npm run dev              # Next.js dev server
npm run build             # static export build -> frontend/out (served by backend)
npm run lint
npm run test               # vitest run (alias: test:unit)
npm run test:unit:watch
npm run test:e2e           # playwright
npm run test:all           # unit + e2e
```
Run a single vitest file: `npx vitest run src/lib/kanban.test.ts`
Run a single playwright test: `npx playwright test tests/kanban.spec.ts`
Coverage: `npx vitest run --coverage` (uses `@vitest/coverage-v8`, already a devDependency).

### Backend (`backend/`)
```bash
pip install -r requirements.txt
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload   # from backend/
pytest                                       # from backend/, runs tests/
pytest tests/test_api.py::test_health_endpoint   # single test
```
Backend is expected to be managed with `uv` per `AGENTS.md`, though `requirements.txt` + `pip` also work locally.
Coverage: `pip install pytest-cov` (not in `requirements.txt`, matching `pytest` itself — both are dev-only and installed ad hoc), then `pytest --cov=app --cov-report=term-missing`.

### Full stack (repo root)
```bash
scripts/start.sh   # runs `python3 -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000` from repo root
scripts/stop.sh     # kills whatever is listening on :8000
docker compose up --build
```
The backend serves the built frontend as static files at `/` (mounted from `frontend/out`), so for the integrated experience run `npm run build` in `frontend/` before starting the backend.

## Architecture

**Two independently-runnable halves, joined at deploy time.** In dev, the Next.js frontend (port 3000) talks to the FastAPI backend (port 8000, via the shared `API_BASE` constant in `frontend/src/lib/config.ts`, overridable with `NEXT_PUBLIC_API_BASE`) over plain fetch calls with CORS wide open. In the Docker build, the frontend is compiled to a static export (`next build` → `frontend/out/`) and FastAPI mounts it at `/` via `StaticFiles`, so the whole app is served from a single port 8000 container.

**Backend (`backend/app/main.py`)** is a single-file FastAPI app:
- SQLite (`backend/data/kanban.db`, auto-created, path overridable via `KANBAN_DB_PATH` for test isolation) has four tables: `users(id, username UNIQUE, password_hash, created_at)`, `sessions(token PRIMARY KEY, user_id, created_at)`, `boards(id PRIMARY KEY, user_id, name, board_json, created_at, updated_at)`, and `board_collaborators(board_id, user_id, added_at)` (composite PK) — a user can own any number of boards, each stored as one JSON blob, and a board can be shared with other users via `board_collaborators`. `init_db()` detects the old pre-multi-board `boards(user_id PRIMARY KEY, ...)` shape and drops/recreates it (local dev DB only, no migration of real data needed).
- Auth: `POST /api/auth/register` and `POST /api/auth/login` hash/verify passwords with `bcrypt` and issue an opaque session token (`secrets.token_urlsafe`) stored in `sessions`; `POST /api/auth/logout` deletes it; `GET /api/auth/me` returns the caller's identity; `PUT /api/auth/password` re-hashes the password after verifying the current one (existing sessions are not invalidated). All other endpoints require `Authorization: Bearer <token>` and resolve to a `CurrentUser` via the `get_current_user` FastAPI dependency.
- Boards and sharing: `GET/POST /api/boards` (list/create for the current user — the list includes boards owned by the caller and boards shared with them) and `GET/PUT/DELETE /api/boards/{board_id}` (read/rename+save/delete). Two access levels: `get_accessible_board_row` (owner or collaborator — used for read/update/chat) and `get_owned_board_row` (owner only — used for delete and collaborator management), both raising 404 for a nonexistent board and 403 if access is denied. `GET/POST /api/boards/{board_id}/collaborators` and `DELETE /api/boards/{board_id}/collaborators/{user_id}` manage sharing by username; only the owner can add/remove. `BoardSummary`/`BoardResponse` include `is_owner` so the frontend can gate owner-only UI.
- `POST /api/chat` — takes `board_id` plus the client's live board state and conversation history, verifies the caller has access to the board (owner or collaborator), then sends it to OpenRouter (`openai/gpt-oss-120b`, requires `OPENROUTER_API_KEY`, loaded from a project-root `.env` via `python-dotenv`), requesting `response_format: json_object` so the model returns `assistant_message` and an optional `board` field. `extract_json_object`/`parse_ai_response_text` do manual brace-matching to pull the JSON object out of the raw model text as a defense-in-depth fallback. If the model includes a `board` field with both `columns` and `cards` keys, that board is persisted to the given `board_id` immediately — chat-driven board updates are saved as a side effect of the chat call, not a separate explicit save.

**Frontend (`frontend/src/`)** is Next.js App Router + TypeScript, static-exported:
- `lib/kanban.ts` — the board data model (`BoardData` = `{ columns: Column[], cards: Record<string, Card> }`) and pure functions like `moveCard` that reassign cards between/within columns given a drag source/target id. This is the one place that understands drag-and-drop reordering semantics; UI components call into it rather than mutating column/card arrays directly.
- `lib/config.ts` — the single shared `API_BASE` constant; all fetch calls import from here rather than hardcoding the backend origin.
- `lib/api.ts` — the single typed fetch wrapper for the backend (auth, boards CRUD, chat); attaches the `Authorization` header when a token is passed and throws `ApiError` (with `.status`) on non-2xx responses.
- `lib/session.ts` — persists `{ token, userId, username }` to `localStorage` so a page refresh doesn't require re-login.
- `app/page.tsx` — top-level state owner: restores a session from `localStorage` and validates it against `/api/auth/me` on mount, loads the signed-in user's board list (auto-creating a first "My board" if they have none, and including boards shared with them), and owns `boards`/`activeBoardId`/`board`/`isActiveBoardOwner` state, passing `board`/`onBoardChange` down to both `KanbanBoard` and `ChatPanel` so either one can update shared board state and the chat sidebar's context always matches what's on screen.
- `components/KanbanBoard.tsx` + `KanbanColumn.tsx` + `KanbanCard.tsx`/`KanbanCardPreview.tsx` — board rendering and `@dnd-kit`-based drag-and-drop; saves via `updateBoard(token, boardId, { board })` on a debounce. Columns can be added/deleted (not just renamed, cascade-deleting their cards); cards carry an optional `priority` (low/medium/high) and `dueDate` set from `NewCardForm.tsx`; a header search box filters rendered cards by title (matched ids are also what's passed to each column's `SortableContext`, so filtered-out cards aren't drag targets). `KanbanCard.tsx` also supports editing a card in place (pencil icon swaps the card body for a form; `useSortable`'s `disabled` option is set while editing so dnd-kit doesn't intercept clicks/typing) and shows an "Overdue" style on the due-date badge when `dueDate` is in the past.
- `components/ChatPanel.tsx` — chat sidebar; calls `sendChatMessage(token, boardId, board, messages)` and applies any returned `board` to shared state via `onBoardUpdate`.
- `components/BoardSwitcher.tsx` — lists the signed-in user's boards as pills, with create (`window.prompt`)/rename (inline input)/delete (`window.confirm`) controls; the delete control is hidden for boards where `is_owner` is false, and such boards show "(shared by {owner_username})".
- `components/LoginScreen.tsx` — real register/login form (toggle between modes) against `/api/auth/register` and `/api/auth/login`.
- `components/ChangePasswordForm.tsx` — toggled from an "Account" button in `page.tsx`'s header; calls `PUT /api/auth/password`.
- `components/CollaboratorsPanel.tsx` — toggled from a "Share" button (shown once a board is active) in `page.tsx`'s header; lists a board's collaborators and, for owners only, an add-by-username form and per-collaborator remove buttons.
- Tests sit next to the code they cover (`*.test.tsx`/`*.test.ts` via Vitest + Testing Library); `tests/kanban.spec.ts` holds the Playwright e2e flow, which now registers a fresh user through the real backend rather than a mocked login — `playwright.config.ts` boots both the FastAPI backend (against a throwaway `KANBAN_DB_PATH`) and the Next dev server as `webServer` entries.

## Coding standards (from AGENTS.md)

- Use latest/idiomatic versions of libraries.
- Keep it simple: no over-engineering, no unnecessary defensive programming, no speculative features.
- Be concise; no emojis, ever.
- When debugging, find root cause before fixing — don't guess-and-check.
- Color palette is fixed: accent yellow `#ecad0a`, blue primary `#209dd7`, purple secondary `#753991`, dark navy `#032147`, gray text `#888888`.
