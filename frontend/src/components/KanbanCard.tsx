import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { Pencil, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { Card, Priority } from "@/lib/kanban";

const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-[var(--accent-yellow)] text-[var(--navy-dark)]",
  medium: "bg-[var(--primary-blue)] text-white",
  low: "border border-[var(--stroke)] text-[var(--gray-text)]",
};

export type CardEdits = {
  title: string;
  details: string;
  priority: Priority;
  dueDate: string | null;
};

type KanbanCardProps = {
  card: Card;
  onDelete: (cardId: string) => void;
  onEdit: (cardId: string, updates: CardEdits) => void;
};

// Local calendar date as YYYY-MM-DD (not toISOString, which is UTC and can
// roll over to the next day while it's still "today" locally).
const todayIso = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
};

export const KanbanCard = ({ card, onDelete, onEdit }: KanbanCardProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [formState, setFormState] = useState<CardEdits>({
    title: card.title,
    details: card.details,
    priority: card.priority ?? "medium",
    dueDate: card.dueDate ?? "",
  });

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    disabled: isEditing,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const startEditing = () => {
    setFormState({
      title: card.title,
      details: card.details,
      priority: card.priority ?? "medium",
      dueDate: card.dueDate ?? "",
    });
    setIsEditing(true);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formState.title.trim()) {
      return;
    }
    onEdit(card.id, {
      title: formState.title.trim(),
      details: formState.details.trim(),
      priority: formState.priority,
      dueDate: formState.dueDate || null,
    });
    setIsEditing(false);
  };

  const isOverdue = !!card.dueDate && card.dueDate < todayIso();

  if (isEditing) {
    return (
      <article
        ref={setNodeRef}
        style={style}
        className="rounded-2xl border border-[var(--primary-blue)] bg-white px-4 py-4 shadow-[0_12px_24px_rgba(3,33,71,0.08)]"
        data-testid={`card-${card.id}`}
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            value={formState.title}
            onChange={(event) => setFormState((prev) => ({ ...prev, title: event.target.value }))}
            placeholder="Card title"
            aria-label="Edit card title"
            className="w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm font-medium text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
            required
          />
          <textarea
            value={formState.details}
            onChange={(event) => setFormState((prev) => ({ ...prev, details: event.target.value }))}
            placeholder="Details"
            aria-label="Edit card details"
            rows={3}
            className="w-full resize-none rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--gray-text)] outline-none focus:border-[var(--primary-blue)]"
          />
          <div className="flex items-center gap-2">
            <select
              value={formState.priority}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, priority: event.target.value as Priority }))
              }
              aria-label="Edit card priority"
              className="rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            <input
              type="date"
              value={formState.dueDate ?? ""}
              onChange={(event) => setFormState((prev) => ({ ...prev, dueDate: event.target.value }))}
              aria-label="Edit card due date"
              className="flex-1 rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]"
            >
              Cancel
            </button>
          </div>
        </form>
      </article>
    );
  }

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={clsx(
        "rounded-2xl border border-transparent bg-white px-4 py-4 shadow-[0_12px_24px_rgba(3,33,71,0.08)]",
        "transition-all duration-150",
        isDragging && "opacity-60 shadow-[0_18px_32px_rgba(3,33,71,0.16)]"
      )}
      {...attributes}
      {...listeners}
      data-testid={`card-${card.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-display text-base font-semibold text-[var(--navy-dark)]">
            {card.title}
          </h4>
          <p className="mt-2 text-sm leading-6 text-[var(--gray-text)]">
            {card.details}
          </p>
          {card.priority || card.dueDate ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {card.priority ? (
                <span
                  className={clsx(
                    "rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide",
                    PRIORITY_STYLES[card.priority]
                  )}
                >
                  {card.priority}
                </span>
              ) : null}
              {card.dueDate ? (
                <span
                  className={clsx(
                    "rounded-full border px-2 py-0.5 text-xs font-semibold",
                    isOverdue
                      ? "border-[var(--secondary-purple)] text-[var(--secondary-purple)]"
                      : "border-[var(--stroke)] text-[var(--gray-text)]"
                  )}
                >
                  {isOverdue ? "Overdue " : "Due "}
                  {card.dueDate}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={startEditing}
            className="rounded-full border border-transparent p-1.5 text-[var(--gray-text)] transition hover:border-[var(--stroke)] hover:bg-[var(--surface)] hover:text-[var(--primary-blue)]"
            aria-label={`Edit ${card.title}`}
          >
            <Pencil size={16} strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(card.id)}
            className="rounded-full border border-transparent p-1.5 text-[var(--gray-text)] transition hover:border-[var(--stroke)] hover:bg-[var(--surface)] hover:text-[var(--secondary-purple)]"
            aria-label={`Delete ${card.title}`}
          >
            <Trash2 size={16} strokeWidth={2} />
          </button>
        </div>
      </div>
    </article>
  );
};
