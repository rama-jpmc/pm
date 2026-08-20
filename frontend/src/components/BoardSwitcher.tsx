"use client";

import { useRef, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { BoardSummary } from "@/lib/api";

type BoardSwitcherProps = {
  boards: BoardSummary[];
  activeBoardId: string | null;
  onSelect: (boardId: string) => void;
  onCreate: (name: string) => void;
  onRename: (boardId: string, name: string) => void;
  onDelete: (boardId: string) => void;
};

export const BoardSwitcher = ({
  boards,
  activeBoardId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: BoardSwitcherProps) => {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  // Unmounting the focused rename input fires a native blur, which would
  // otherwise re-submit (Enter) or resurrect (Escape) the just-finished
  // rename. Set before the state change that unmounts the input, so the
  // resulting blur is a no-op.
  const skipNextBlurRef = useRef(false);

  const startRename = (board: BoardSummary) => {
    setRenamingId(board.id);
    setRenameValue(board.name);
  };

  const submitRename = (boardId: string) => {
    const trimmed = renameValue.trim();
    if (trimmed) {
      onRename(boardId, trimmed);
    }
    skipNextBlurRef.current = true;
    setRenamingId(null);
  };

  const handleCreate = () => {
    const name = window.prompt("Name your new board", "Untitled board");
    if (name && name.trim()) {
      onCreate(name.trim());
    }
  };

  const handleDelete = (board: BoardSummary) => {
    if (window.confirm(`Delete "${board.name}"? This cannot be undone.`)) {
      onDelete(board.id);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-3 shadow-[var(--shadow)] backdrop-blur">
      {boards.map((board) => {
        const isActive = board.id === activeBoardId;

        if (renamingId === board.id) {
          return (
            <input
              key={board.id}
              value={renameValue}
              autoFocus
              aria-label={`Rename ${board.name}`}
              onChange={(event) => setRenameValue(event.target.value)}
              onBlur={() => {
                if (skipNextBlurRef.current) {
                  skipNextBlurRef.current = false;
                  return;
                }
                submitRename(board.id);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  submitRename(board.id);
                }
                if (event.key === "Escape") {
                  skipNextBlurRef.current = true;
                  setRenamingId(null);
                }
              }}
              className="rounded-full border border-[var(--stroke)] px-3 py-1.5 text-sm outline-none"
            />
          );
        }

        return (
          <div
            key={board.id}
            data-testid={`board-tab-${board.id}`}
            className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-semibold ${
              isActive
                ? "border-[var(--primary-blue)] bg-[var(--primary-blue)] text-white"
                : "border-[var(--stroke)] text-[var(--navy-dark)]"
            }`}
          >
            <button type="button" onClick={() => onSelect(board.id)}>
              {board.name}
              {!board.is_owner ? (
                <span className={isActive ? "text-white/80" : "text-[var(--gray-text)]"}>
                  {" "}
                  (shared by {board.owner_username})
                </span>
              ) : null}
            </button>
            <button
              type="button"
              aria-label={`Rename ${board.name}`}
              onClick={() => startRename(board)}
              className={isActive ? "text-white" : "text-[var(--gray-text)]"}
            >
              <Pencil size={14} />
            </button>
            {board.is_owner ? (
              <button
                type="button"
                aria-label={`Delete ${board.name}`}
                onClick={() => handleDelete(board)}
                className={isActive ? "text-white" : "text-[var(--gray-text)]"}
              >
                <Trash2 size={14} />
              </button>
            ) : null}
          </div>
        );
      })}
      <button
        type="button"
        onClick={handleCreate}
        className="flex items-center gap-1 rounded-full bg-[var(--secondary-purple)] px-3 py-1.5 text-sm font-semibold text-white"
      >
        <Plus size={14} /> New board
      </button>
    </div>
  );
};
