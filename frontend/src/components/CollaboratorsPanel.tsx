"use client";

import { X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import {
  ApiError,
  addCollaborator,
  listCollaborators,
  removeCollaborator,
  type Collaborator,
} from "@/lib/api";

type CollaboratorsPanelProps = {
  token: string;
  boardId: string;
  isOwner: boolean;
  onClose: () => void;
};

export const CollaboratorsPanel = ({ token, boardId, isOwner, onClose }: CollaboratorsPanelProps) => {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listCollaborators(token, boardId)
      .then(setCollaborators)
      .catch(() => setError("Unable to load collaborators."))
      .finally(() => setIsLoading(false));
  }, [token, boardId]);

  const handleAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!username.trim()) {
      return;
    }
    setError(null);
    try {
      const updated = await addCollaborator(token, boardId, username.trim());
      setCollaborators(updated);
      setUsername("");
    } catch (submitError) {
      if (submitError instanceof ApiError) {
        setError(submitError.message);
      } else {
        setError("Unable to reach the server.");
      }
    }
  };

  const handleRemove = async (userId: string) => {
    setError(null);
    try {
      await removeCollaborator(token, boardId, userId);
      setCollaborators((prev) => prev.filter((collaborator) => collaborator.user_id !== userId));
    } catch {
      setError("Unable to remove that collaborator.");
    }
  };

  return (
    <div className="mt-3 w-full max-w-xs space-y-3 rounded-2xl border border-[var(--stroke)] bg-white p-4 shadow-[var(--shadow)]">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold text-[var(--navy-dark)]">Shared with</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]"
        >
          Close
        </button>
      </div>

      {isLoading ? (
        <p className="text-xs text-[var(--gray-text)]">Loading...</p>
      ) : (
        <ul className="space-y-2">
          {collaborators.length === 0 ? (
            <li className="text-xs text-[var(--gray-text)]">No one else has access yet.</li>
          ) : null}
          {collaborators.map((collaborator) => (
            <li
              key={collaborator.user_id}
              className="flex items-center justify-between gap-2 text-sm text-[var(--navy-dark)]"
            >
              {collaborator.username}
              {isOwner ? (
                <button
                  type="button"
                  onClick={() => handleRemove(collaborator.user_id)}
                  aria-label={`Remove ${collaborator.username}`}
                  className="rounded-full p-1 text-[var(--gray-text)] transition hover:text-[var(--secondary-purple)]"
                >
                  <X size={14} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {isOwner ? (
        <form onSubmit={handleAdd} className="flex items-center gap-2">
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Username"
            aria-label="Add collaborator username"
            className="min-w-0 flex-1 rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm outline-none focus:border-[var(--primary-blue)]"
          />
          <button
            type="submit"
            className="flex-shrink-0 rounded-full bg-[var(--secondary-purple)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white"
          >
            Add
          </button>
        </form>
      ) : null}

      {error ? (
        <p className="text-xs font-semibold text-[var(--secondary-purple)]">{error}</p>
      ) : null}
    </div>
  );
};
