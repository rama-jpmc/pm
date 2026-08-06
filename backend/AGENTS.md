Backend implementation notes

- FastAPI backend serving board persistence and chat support.
- Add OpenRouter AI chat connectivity through `/api/chat`.
- Use `OPENROUTER_API_KEY` from environment for secure access.
- Support structured assistant responses with an optional `board` field for updates.
- Keep board persistence separate from chat flow; chat can suggest board changes without saving automatically.
