# Project plan and implementation status

## Scope

This project is implementing a minimal proof-of-concept project management app with a single Kanban board, a simple mock login, a basic chat panel, and SQLite-backed persistence. The goal is to prove the core experience end to end without over-engineering the MVP.

## Current implementation decisions

- Frontend: Next.js with the App Router and React 19, using TypeScript.
- Backend: FastAPI running locally with a small SQLite database file.
- Persistence: each user has a single board record stored as JSON in the database.
- Authentication: a simple front-end mock login using the demo credentials user / password.
- Chat: sidebar chat calls the backend `/api/chat` endpoint, which in turn calls OpenRouter (`openai/gpt-oss-120b`) and can return a structured board update that is auto-applied and persisted.
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

### Part 4: Mock login
- [x] Add a simple login screen requiring user / password.
- [x] Gate the board behind authentication for the PoC.
- [x] Add tests for the login screen.

### Part 5: Database modeling and persistence
- [x] Implement a SQLite schema with a boards table.
- [x] Store each user’s board as JSON in the database.
- [x] Ensure the database is created automatically if it does not exist.
- [x] Add backend tests for the save/load flow.

### Part 6: Backend API
- [x] Add health and board read/write endpoints.
- [x] Validate the backend API with automated tests.

### Part 7: Frontend + backend integration
- [x] Connect the frontend to the backend so board changes persist per user.
- [x] Verify the app works locally with the backend running.

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

## Success criteria for the current PoC

- A user can sign in with the demo credentials.
- The board loads and supports rename, add, delete, and drag-and-drop interactions.
- Board state persists to SQLite for the signed-in user.
- The app can be run locally through the backend and frontend.

## Notes for the next phase

Core AI chat flow (Parts 8-10) is implemented end to end, but only verified with a mocked OpenRouter response in tests. Remaining work: a real run against the live OpenRouter API with a valid `OPENROUTER_API_KEY`, and hardening around malformed/non-JSON model output (currently falls back to treating the raw text as the assistant message with no board update, which is reasonable but untested against real model quirks).
