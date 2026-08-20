# The Project Management MVP web app

## Business Requirements

This project is building a Project Management App. Key features:
- A user can register an account, sign in with a username and password, and change their password
- Each user can own multiple Kanban boards, and can create, rename, switch between, and delete boards
- A board owner can share a board with another registered user by username; the shared user can view and edit the board's content but cannot delete it or manage its collaborators
- When signed in, the user sees their selected Kanban board
- The Kanban board's columns can be renamed, added, and deleted
- Cards can be moved with drag and drop, edited, and given a priority (low/medium/high) and an optional due date
- A search box filters the visible cards on the active board by title
- There is an AI chat feature in a sidebar; the AI is able to create / edit / move one or more cards on the currently selected board

## Limitations

User accounts are real (registered with a hashed password and a server-issued session token), but auth is intentionally lightweight for local, single-machine use: no email verification, password reset, or role/permission system.

For the MVP, this will run locally (in a docker container)

## Technical Decisions

- NextJS frontend
- Python FastAPI backend, including serving the static NextJS site at /
- Everything packaged into a Docker container
- Use "uv" as the package manager for python in the Docker container
- Use OpenRouter for the AI calls. An OPENROUTER_API_KEY is in .env in the project root
- Use `openai/gpt-oss-120b` as the model
- Use SQLLite local database for the database, creating a new db if it doesn't exist
- Passwords are hashed with bcrypt; sessions are opaque server-issued tokens stored in a `sessions` table and sent by the client as a `Bearer` token
- Start and Stop server scripts for Mac, PC, Linux in scripts/

## Starting Point

A working MVP of the frontend has been built and is already in frontend. This is not yet designed for the Docker setup. It's a pure frontend-only demo.

## Color Scheme

- Accent Yellow: `#ecad0a` - accent lines, highlights
- Blue Primary: `#209dd7` - links, key sections
- Purple Secondary: `#753991` - submit buttons, important actions
- Dark Navy: `#032147` - main headings
- Gray Text: `#888888` - supporting text, labels

## Coding standards

1. Use latest versions of libraries and idiomatic approaches as of today
2. Keep it simple - NEVER over-engineer, ALWAYS simplify, NO unnecessary defensive programming. No extra features - focus on simplicity.
3. Be concise. Keep README minimal. IMPORTANT: no emojis ever
4. When hitting issues, always identify root cause before trying a fix. Do not guess. Prove with evidence, then fix the root cause.

## Working documentation

All documents for planning and executing this project will be in the docs/ directory.
Please review the docs/PLAN.md document before proceeding.