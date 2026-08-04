# Frontend implementation notes

This frontend is a Next.js app for a single-board Kanban experience.

## Current structure
- app/page.tsx: entry point that gates the UI behind a simple mock login screen.
- components/KanbanBoard.tsx: main board with drag-and-drop, rename, add, and delete interactions.
- components/KanbanColumn.tsx: column container and drop target.
- components/NewCardForm.tsx: form for creating cards.
- lib/kanban.ts: board model utilities and card movement logic.

## Testing
- Unit tests live alongside components and the kanban logic.
- Use npm test to run the Vitest suite.
