# Project plan and implementation status

## Scope

This project is a local-first project management app: users register/sign in with real accounts, each user owns any number of Kanban boards, a chat sidebar can edit the active board, and everything is backed by SQLite. The goal is to keep the implementation simple and well-tested while supporting multiple users and multiple boards per user, not just a single-board demo.

## Current implementation decisions

- Frontend: Next.js with the App Router and React 19, using TypeScript.
- Backend: FastAPI running locally with a small SQLite database file.
- Persistence: `users`, `sessions`, and `boards` tables; a user can own many boards, each stored as one JSON blob (see `CLAUDE.md` for the exact schema).
- Authentication: real registration/login backed by bcrypt-hashed passwords and server-issued bearer session tokens (`backend/app/main.py`); the frontend persists the token in `localStorage` (`frontend/src/lib/session.ts`) and revalidates it against `/api/auth/me` on load.
- Boards: `BoardSwitcher.tsx` lets a user create, rename, switch between, and delete boards; a new account gets one starter board automatically.
- Chat: sidebar chat calls the backend `/api/chat` endpoint (scoped to the active `board_id`), which in turn calls OpenRouter (`openai/gpt-oss-120b`) and can return a structured board update that is auto-applied and persisted to that board.
- Delivery: the frontend is built as a static export and served by the backend for local development and container-based deployment.
- Docker: local container support is scaffolded with a Dockerfile, docker-compose.yml, and shell scripts for start/stop.

## Status checklist

### Part 1: Planning and documentation
- [x] Capture the MVP scope and success criteria.
- [x] Create a frontend-specific agent note in frontend/AGENTS.md.
- [x] Record the latest implementation decisions in this document.

### Part 2: Scaffolding
- [x] Create the FastAPI backend structure under backend/.
- [x] Add Docker scaffolding at the repo root.
- [x] Add local start and stop scripts under scripts/.
- [x] Verify a local backend can start and serve API routes.

### Part 3: Frontend
- [x] Build a static-exportable Next.js frontend.
- [x] Render the demo Kanban board at /.
- [x] Add unit tests for the Kanban board behavior.

### Part 4: Real user accounts
- [x] Add a register/login screen backed by real backend accounts (`LoginScreen.tsx`, `/api/auth/register`, `/api/auth/login`).
- [x] Hash passwords with bcrypt and issue bearer session tokens (`/api/auth/logout`, `/api/auth/me`).
- [x] Persist the session across reloads via `localStorage` and revalidate on load.
- [x] Add tests for the login/register screen.

### Part 5: Database modeling and persistence
- [x] Implement a SQLite schema with `users`, `sessions`, and `boards` tables (one row per board, not per user).
- [x] Store each board as JSON in the database, scoped to its owning user.
- [x] Ensure the database is created automatically if it does not exist, and migrate the old single-board-per-user shape automatically.
- [x] Add backend tests for auth, board ownership, and the save/load flow.

### Part 6: Backend API
- [x] Add health, auth (register/login/logout/me), and board CRUD endpoints (list/create/get/update/delete), all scoped to the authenticated user.
- [x] Validate the backend API with automated tests, including cross-user access checks (403/404).

### Part 7: Frontend + backend integration
- [x] Connect the frontend to the backend so board changes persist per board.
- [x] Add a board switcher so a user can create, rename, switch between, and delete boards (`BoardSwitcher.tsx`).
- [x] Verify the app works locally with the backend running (unit, e2e, and manual checks).

### Part 8: AI connectivity
- [x] Add OpenRouter-based AI connectivity (`POST /api/chat` in `backend/app/main.py`).
- [x] Validate a simple AI request flow (`test_chat_endpoint_parses_ai_response` mocks the OpenRouter call).
- [ ] Exercise the flow against the real OpenRouter API (current test coverage mocks `httpx.post`; not yet verified against a live response).

### Part 9: Structured AI board updates
- [x] Send the board JSON and user conversation context to the model.
- [x] Support structured responses that optionally update the Kanban (`extract_json_object`/`parse_ai_response_text` parse `assistant_message` + optional `board`, and persist the board when present).

### Part 10: Full chat experience
- [x] Add a polished sidebar chat experience (`ChatPanel.tsx`: message history, loading/error states, auto-scroll, "Board updated by AI" confirmation).
- [x] Allow the assistant to update the board automatically from structured responses (`onBoardUpdate` applied when the response includes a `board`).

### Part 11: Board and card enhancements
- [x] Add optional `priority` (low/medium/high) and `dueDate` fields to cards, validated on the backend (`is_valid_board`) and editable from `NewCardForm.tsx`.
- [x] Allow adding and deleting columns, not just renaming them (`KanbanBoard.tsx`/`KanbanColumn.tsx`), with cascade deletion of a column's cards.
- [x] Add a search box that filters the active board's visible cards by title.
- [x] Cover the above with backend tests (priority/due-date validation), frontend unit tests, and Playwright e2e tests.

### Part 12: Card editing and account management
- [x] Allow editing an existing card's title, details, priority, and due date in place (`KanbanCard.tsx`), not just add/delete.
- [x] Show an "Overdue" style on the due-date badge when a card's `dueDate` is in the past.
- [x] Add a change-password flow: `PUT /api/auth/password` on the backend, `ChangePasswordForm.tsx` behind an "Account" toggle in the header on the frontend.
- [x] Cover the above with backend tests (password change success/failure paths), frontend unit tests, and Playwright e2e tests.

### Part 13: Board collaboration
- [x] Add a `board_collaborators` table and split board access into owner-only (`get_owned_board_row`: delete, manage collaborators) vs owner-or-collaborator (`get_accessible_board_row`: read, update content/name, chat).
- [x] Add `GET/POST /api/boards/{id}/collaborators` and `DELETE /api/boards/{id}/collaborators/{user_id}`, owner-only for add/remove; `GET /api/boards` now also returns boards shared with the caller, with `is_owner`/`owner_username` on each summary.
- [x] Add `CollaboratorsPanel.tsx` behind a "Share" toggle in the header; `BoardSwitcher.tsx` hides the delete control and shows "(shared by X)" for boards the user doesn't own.
- [x] Cover the above with backend tests (add/remove, ownership enforcement, unknown username, sharing with the owner, collaborator board list visibility), frontend unit tests, and a two-browser-context Playwright e2e test (owner shares a board, guest edits it, owner sees the change after reload).

### Part 14: Review and hardening pass
- [x] Full-repo code review of the accumulated multi-user/multi-board/collaboration diff; four findings fixed:
  - `NewCardForm.tsx` used hardcoded (non-unique) DOM ids for its priority/due-date labels, breaking label association when two columns' add-card forms are open at once — switched to React's `useId()`.
  - `KanbanCard.tsx`'s overdue check computed "today" via `toISOString()` (UTC), which could mark a card overdue several hours early for users behind UTC — switched to a local-calendar-date computation.
  - `BoardSwitcher.tsx`'s rename input could double-submit (Enter, then a blur fired by the input unmounting) or resurrect a cancelled rename (Escape's unmount-triggered blur) — added a ref guard so the unmount-driven blur is a no-op.
  - `page.tsx` constructed the same `BoardSummary` object literal in three places; extracted a `toOwnedBoardSummary` helper.
- [x] Measured test coverage: backend 99% line coverage (`pytest --cov=app`, 3 lines left uncovered are unreachable defensive branches in `is_valid_board`'s early-return chain), frontend ~90% on `components/`, ~78% on `lib/` (`page.tsx` and `session.ts` are exercised primarily through the Playwright e2e suite rather than vitest).
- [x] Added targeted backend tests to close coverage gaps: legacy-schema migration (`init_db`), a bearer-token-with-no-token-value 401, seven `is_valid_board` malformed-payload shapes, an AI response with balanced-but-invalid JSON, and an AI response missing `choices`.
- [x] Added a regression test for the `BoardSwitcher` rename fix (Enter renames exactly once; Escape never calls `onRename`).

## Success criteria for the current phase

- A user can register an account, sign in, and change their password.
- A user can create, rename, switch between, and delete boards; each board persists independently.
- A board owner can share a board with another user by username; the collaborator can view and edit it but not delete it or manage sharing.
- The active board loads and supports column add/rename/delete, card add/edit/delete with priority and due date, drag-and-drop, and search/filter.
- Board state persists to SQLite, scoped to owner and collaborators; users without access cannot read or write a board.
- The app can be run locally through the backend and frontend, and the full test suite (backend pytest, frontend vitest, Playwright e2e) passes.

## Notes for the next phase

Core AI chat flow (Parts 8-10) is implemented end to end, but only verified with a mocked OpenRouter response in tests. Remaining work: a real run against the live OpenRouter API with a valid `OPENROUTER_API_KEY`, and hardening around malformed/non-JSON model output (currently falls back to treating the raw text as the assistant message with no board update, which is reasonable but untested against real model quirks).

Sessions are permanent bearer tokens with no expiry, and there is no password reset or account recovery — acceptable for local single-machine use per `AGENTS.md`, but worth flagging if this ever needs to run somewhere less trusted.
