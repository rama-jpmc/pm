# Frontend implementation notes

This frontend is a Next.js app for a single-board Kanban experience.

## Current structure
- app/page.tsx: entry point that gates the UI behind a simple mock login screen and owns the shared board state used by both the board and the chat sidebar.
- components/LoginScreen.tsx: mock credential gate (user / password).
- components/KanbanBoard.tsx: main board with drag-and-drop, rename, add, and delete interactions.
- components/KanbanColumn.tsx: column container and drop target.
- components/KanbanCard.tsx: draggable card rendered inside a column.
- components/KanbanCardPreview.tsx: drag-overlay preview of the active card.
- components/NewCardForm.tsx: form for creating cards.
- components/ChatPanel.tsx: sidebar chat that calls the backend `/api/chat` endpoint and can apply AI-suggested board updates.
- lib/kanban.ts: board model utilities and card movement logic.
- lib/config.ts: shared `API_BASE` constant (backend origin) used by all components that call the API.

## Testing
- Unit tests live alongside components and the kanban logic.
- Use npm test to run the Vitest suite.
