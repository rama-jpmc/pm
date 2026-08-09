# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A single-user-at-a-time Project Management MVP: a Kanban board with drag-and-drop, backed by a FastAPI + SQLite backend, with an AI chat sidebar (OpenRouter) that can create/edit/move cards. See `AGENTS.md` for full business requirements, `docs/PLAN.md` for current implementation status, and `docs/code_review.md` for a full-repo review with a resolved/open action list.

MVP scope: hardcoded login (`user`/`password`), one board per user, runs locally via Docker.

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

### Backend (`backend/`)
```bash
pip install -r requirements.txt
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload   # from backend/
pytest                                       # from backend/, runs tests/
pytest tests/test_api.py::test_health_endpoint   # single test
```
Backend is expected to be managed with `uv` per `AGENTS.md`, though `requirements.txt` + `pip` also work locally.

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
- SQLite (`backend/data/kanban.db`, auto-created) has one table `boards(user_id PRIMARY KEY, board_json, updated_at)` — the entire board (columns + cards) is stored as one JSON blob per user, not normalized.
- `GET/POST /api/board` — load/save the board JSON for a `user_id`.
- `POST /api/chat` — sends board state + conversation history to OpenRouter (`openai/gpt-oss-120b`, requires `OPENROUTER_API_KEY`, loaded from a project-root `.env` via `python-dotenv`), requesting `response_format: json_object` so the model returns `assistant_message` and an optional `board` field. `extract_json_object`/`parse_ai_response_text` do manual brace-matching to pull the JSON object out of the raw model text as a defense-in-depth fallback. If the model includes a `board` field with both `columns` and `cards` keys, that board is persisted immediately — chat-driven board updates are saved as a side effect of the chat call, not a separate explicit save.
- No real auth: `user_id` is passed by the client on every request; login is a frontend-only mock.

**Frontend (`frontend/src/`)** is Next.js App Router + TypeScript, static-exported:
- `lib/kanban.ts` — the board data model (`BoardData` = `{ columns: Column[], cards: Record<string, Card> }`) and pure functions like `moveCard` that reassign cards between/within columns given a drag source/target id. This is the one place that understands drag-and-drop reordering semantics; UI components call into it rather than mutating column/card arrays directly.
- `lib/config.ts` — the single shared `API_BASE` constant; all fetch calls import from here rather than hardcoding the backend origin.
- `app/page.tsx` — top-level state owner: seeds `board` with the local demo data (`initialData`), fetches the real saved board from the backend on login (overriding the seed only if it's non-empty), and passes `board`/`onBoardChange` down to both `KanbanBoard` and `ChatPanel` so either one can update shared board state and the chat sidebar's context always matches what's on screen.
- `components/KanbanBoard.tsx` + `KanbanColumn.tsx` + `KanbanCard.tsx`/`KanbanCardPreview.tsx` — board rendering and `@dnd-kit`-based drag-and-drop.
- `components/ChatPanel.tsx` — chat sidebar; calls `/api/chat` and applies any returned `board` to shared state via `onBoardUpdate`.
- `components/LoginScreen.tsx` — mock credential gate.
- Tests sit next to the code they cover (`*.test.tsx`/`*.test.ts` via Vitest + Testing Library); `tests/kanban.spec.ts` holds the Playwright e2e flow.

## Coding standards (from AGENTS.md)

- Use latest/idiomatic versions of libraries.
- Keep it simple: no over-engineering, no unnecessary defensive programming, no speculative features.
- Be concise; no emojis, ever.
- When debugging, find root cause before fixing — don't guess-and-check.
- Color palette is fixed: accent yellow `#ecad0a`, blue primary `#209dd7`, purple secondary `#753991`, dark navy `#032147`, gray text `#888888`.
