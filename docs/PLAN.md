# Project plan and implementation status

## Scope

This project is implementing a minimal proof-of-concept project management app with a single Kanban board, a simple mock login, a basic chat panel, and SQLite-backed persistence. The goal is to prove the core experience end to end without over-engineering the MVP.

## Current implementation decisions

- Frontend: Next.js with the App Router and React 19, using TypeScript.
- Backend: FastAPI running locally with a small SQLite database file.
- Persistence: each user has a single board record stored as JSON in the database.
- Authentication: a simple front-end mock login using the demo credentials user / password.
- Chat: a lightweight UI-only chat experience for the PoC; it does not yet call an AI provider.
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
- [ ] Add OpenRouter-based AI connectivity.
- [ ] Validate a simple AI request flow.

### Part 9: Structured AI board updates
- [ ] Send the board JSON and user conversation context to the model.
- [ ] Support structured responses that optionally update the Kanban.

### Part 10: Full chat experience
- [ ] Add a polished sidebar chat experience.
- [ ] Allow the assistant to update the board automatically from structured responses.

## Success criteria for the current PoC

- A user can sign in with the demo credentials.
- The board loads and supports rename, add, delete, and drag-and-drop interactions.
- Board state persists to SQLite for the signed-in user.
- The app can be run locally through the backend and frontend.

## Notes for the next phase

The remaining work focuses on replacing the placeholder chat experience with real AI integration and structured board updates. That should happen only after the current PoC is considered stable.
