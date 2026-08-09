Backend implementation notes

- FastAPI backend serving board persistence and chat support.
- Add OpenRouter AI chat connectivity through `/api/chat`.
- Use `OPENROUTER_API_KEY` from environment for secure access.
- Support structured assistant responses with an optional `board` field for updates.
- When a chat response includes a valid `board` field, persist it immediately as part of the `/api/chat` call (validated the same way as `/api/board`) rather than requiring a separate explicit save.
