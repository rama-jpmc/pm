import clsx from "clsx";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Trash2 } from "lucide-react";
import type { Card, Column, Priority } from "@/lib/kanban";
import { KanbanCard, type CardEdits } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";

type KanbanColumnProps = {
  column: Column;
  cards: Card[];
  onRename: (columnId: string, title: string) => void;
  onAddCard: (
    columnId: string,
    title: string,
    details: string,
    priority: Priority,
    dueDate: string | null
  ) => void;
  onDeleteCard: (columnId: string, cardId: string) => void;
  onEditCard: (cardId: string, updates: CardEdits) => void;
  onDeleteColumn: (columnId: string) => void;
};

export const KanbanColumn = ({
  column,
  cards,
  onRename,
  onAddCard,
  onDeleteCard,
  onEditCard,
  onDeleteColumn,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  const handleDeleteColumn = () => {
    if (window.confirm(`Delete "${column.title}" and all of its cards?`)) {
      onDeleteColumn(column.id);
    }
  };

  return (
    <section
      ref={setNodeRef}
      className={clsx(
        "flex min-w-0 min-h-[420px] flex-col rounded-3xl border border-[var(--stroke)] bg-[var(--surface-strong)] p-4 shadow-[var(--shadow)] transition",
        isOver && "ring-2 ring-[var(--accent-yellow)]"
      )}
      data-testid={`column-${column.id}`}
    >
      <div className="flex items-center gap-3">
        <span className="h-2 w-2 flex-shrink-0 rounded-full bg-[var(--accent-yellow)]" />
        <input
          value={column.title}
          onChange={(event) => onRename(column.id, event.target.value)}
          className="min-w-0 flex-1 bg-transparent font-display text-lg font-semibold text-[var(--navy-dark)] outline-none"
          aria-label="Column title"
        />
        <span className="flex-shrink-0 rounded-full bg-[var(--surface)] px-2 py-0.5 text-xs font-semibold text-[var(--gray-text)]">
          {cards.length}
        </span>
        <button
          type="button"
          onClick={handleDeleteColumn}
          aria-label={`Delete ${column.title} column`}
          className="flex-shrink-0 rounded-full border border-transparent p-1.5 text-[var(--gray-text)] transition hover:border-[var(--stroke)] hover:bg-[var(--surface)] hover:text-[var(--secondary-purple)]"
        >
          <Trash2 size={16} strokeWidth={2} />
        </button>
      </div>
      <div className="mt-4 flex flex-1 flex-col gap-3">
        <SortableContext items={cards.map((card) => card.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onDelete={(cardId) => onDeleteCard(column.id, cardId)}
              onEdit={onEditCard}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-[var(--stroke)] px-3 py-6 text-center text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            Drop a card here
          </div>
        )}
      </div>
      <NewCardForm
        onAdd={(title, details, priority, dueDate) =>
          onAddCard(column.id, title, details, priority, dueDate)
        }
      />
    </section>
  );
};
