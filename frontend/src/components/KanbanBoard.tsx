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
import { Plus, Search } from "lucide-react";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import type { CardEdits } from "@/components/KanbanCard";
import { updateBoard as saveBoardToApi } from "@/lib/api";
import {
  createId,
  hasBoardData,
  initialData,
  moveCard,
  type BoardData,
  type Priority,
} from "@/lib/kanban";

type KanbanBoardProps = {
  board: BoardData;
  boardId?: string | null;
  token?: string | null;
  onBoardChange?: (board: BoardData) => void;
};

const SAVE_DEBOUNCE_MS = 400;

export const KanbanBoard = ({ board: initialBoard, boardId, token, onBoardChange }: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData>(() =>
    hasBoardData(initialBoard) ? initialBoard : initialData
  );
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [syncedBoard, setSyncedBoard] = useState(initialBoard);
  const [saveError, setSaveError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
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
    if (!token || !boardId) {
      return;
    }

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      saveBoardToApi(token, boardId, { board: next })
        .then(() => setSaveError(false))
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

  const handleAddCard = (
    columnId: string,
    title: string,
    details: string,
    priority: Priority,
    dueDate: string | null
  ) => {
    const id = createId("card");
    updateBoard((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [id]: { id, title, details: details || "No details yet.", priority, dueDate },
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

  const handleEditCard = (cardId: string, updates: CardEdits) => {
    updateBoard((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [cardId]: { ...prev.cards[cardId], ...updates },
      },
    }));
  };

  const handleAddColumn = () => {
    const title = window.prompt("Name your new column", "New column");
    if (!title || !title.trim()) {
      return;
    }
    const id = createId("col");
    updateBoard((prev) => ({
      ...prev,
      columns: [...prev.columns, { id, title: title.trim(), cardIds: [] }],
    }));
  };

  const handleDeleteColumn = (columnId: string) => {
    updateBoard((prev) => {
      const column = prev.columns.find((existing) => existing.id === columnId);
      const cardIdsToRemove = new Set(column?.cardIds ?? []);
      return {
        columns: prev.columns.filter((existing) => existing.id !== columnId),
        cards: Object.fromEntries(
          Object.entries(prev.cards).filter(([id]) => !cardIdsToRemove.has(id))
        ),
      };
    });
  };

  const matchesSearch = (cardId: string) => {
    if (!searchQuery.trim()) {
      return true;
    }
    return board.cards[cardId]?.title
      .toLowerCase()
      .includes(searchQuery.trim().toLowerCase());
  };

  const activeCard = activeCardId ? board.cards[activeCardId] : null;

  return (
    <div className="@container flex flex-col gap-6">
      <header className="flex flex-col gap-4 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-6 shadow-[var(--shadow)] backdrop-blur @2xl:flex-row @2xl:items-center @2xl:justify-between @2xl:gap-8">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
            Kanban Board
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-[var(--navy-dark)]">
            Kanban Studio
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--gray-text)]"
            />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search cards"
              aria-label="Search cards"
              className="rounded-full border border-[var(--stroke)] bg-white py-1.5 pl-8 pr-3 text-xs font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
            />
          </div>
          <button
            type="button"
            onClick={handleAddColumn}
            className="flex items-center gap-1 rounded-full bg-[var(--secondary-purple)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white"
          >
            <Plus size={14} /> Add column
          </button>
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
              cards={column.cardIds.filter(matchesSearch).map((cardId) => board.cards[cardId])}
              onRename={handleRenameColumn}
              onAddCard={handleAddCard}
              onDeleteCard={handleDeleteCard}
              onEditCard={handleEditCard}
              onDeleteColumn={handleDeleteColumn}
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
