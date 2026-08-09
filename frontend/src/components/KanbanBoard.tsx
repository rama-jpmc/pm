"use client";

import { useRef, useState, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { API_BASE } from "@/lib/config";
import { createId, hasBoardData, initialData, moveCard, type BoardData } from "@/lib/kanban";

type KanbanBoardProps = {
  board: BoardData;
  userId?: string | null;
  onBoardChange?: (board: BoardData) => void;
};

const SAVE_DEBOUNCE_MS = 400;

export const KanbanBoard = ({ board: initialBoard, userId, onBoardChange }: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData>(() =>
    hasBoardData(initialBoard) ? initialBoard : initialData
  );
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [syncedBoard, setSyncedBoard] = useState(initialBoard);
  const [saveError, setSaveError] = useState(false);
  const saveTimerRef = useRef<number | null>(null);

  if (initialBoard !== syncedBoard) {
    setSyncedBoard(initialBoard);
    if (hasBoardData(initialBoard)) {
      setBoard(initialBoard);
    }
  }

  // Clear any pending debounced save if the component unmounts mid-edit.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  // Persist a board to the backend, debounced so rapid successive edits
  // (e.g. typing a column title) collapse into a single request. Only
  // called from user-driven mutations below, never from the prop-sync
  // above, so boards that arrive via props (initial load, AI chat updates)
  // are never redundantly re-saved.
  const saveBoard = (next: BoardData) => {
    if (!userId) {
      return;
    }

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      fetch(`${API_BASE}/api/board`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, board: next }),
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Failed to save board: ${response.status}`);
          }
          setSaveError(false);
        })
        .catch(() => setSaveError(true));
    }, SAVE_DEBOUNCE_MS);
  };

  const updateBoard = (updater: (prev: BoardData) => BoardData) => {
    const next = updater(board);
    setBoard(next);
    onBoardChange?.(next);
    saveBoard(next);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);

    if (!over || active.id === over.id) {
      return;
    }

    updateBoard((prev) => ({
      ...prev,
      columns: moveCard(prev.columns, active.id as string, over.id as string),
    }));
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    updateBoard((prev) => ({
      ...prev,
      columns: prev.columns.map((column) =>
        column.id === columnId ? { ...column, title } : column
      ),
    }));
  };

  const handleAddCard = (columnId: string, title: string, details: string) => {
    const id = createId("card");
    updateBoard((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [id]: { id, title, details: details || "No details yet." },
      },
      columns: prev.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: [...column.cardIds, id] }
          : column
      ),
    }));
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    updateBoard((prev) => ({
      ...prev,
      cards: Object.fromEntries(
        Object.entries(prev.cards).filter(([id]) => id !== cardId)
      ),
      columns: prev.columns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              cardIds: column.cardIds.filter((id) => id !== cardId),
            }
          : column
      ),
    }));
  };

  const activeCard = activeCardId ? board.cards[activeCardId] : null;

  return (
    <div className="@container flex flex-col gap-6">
      <header className="flex flex-col gap-4 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-6 shadow-[var(--shadow)] backdrop-blur @2xl:flex-row @2xl:items-center @2xl:justify-between @2xl:gap-8">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
            Single Board Kanban
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-[var(--navy-dark)]">
            Kanban Studio
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {board.columns.map((column) => (
            <div
              key={column.id}
              className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--navy-dark)]"
            >
              <span className="h-2 w-2 flex-shrink-0 rounded-full bg-[var(--accent-yellow)]" />
              {column.title}
              <span className="text-[var(--gray-text)]">{column.cardIds.length}</span>
            </div>
          ))}
        </div>
      </header>

      {saveError ? (
        <p className="text-sm font-semibold text-[var(--secondary-purple)]">
          Unable to save your latest changes to the server. Your edits are only visible in this tab until the connection is restored.
        </p>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <section className="grid grid-cols-1 gap-4 @sm:grid-cols-2 @2xl:grid-cols-3 @6xl:grid-cols-5">
          {board.columns.map((column) => (
            <KanbanColumn
              key={column.id}
              column={column}
              cards={column.cardIds.map((cardId) => board.cards[cardId])}
              onRename={handleRenameColumn}
              onAddCard={handleAddCard}
              onDeleteCard={handleDeleteCard}
            />
          ))}
        </section>
        <DragOverlay>
          {activeCard ? (
            <div className="w-[260px]">
              <KanbanCardPreview card={activeCard} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
};
