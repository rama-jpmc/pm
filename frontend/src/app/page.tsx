"use client";

import { useEffect, useState } from "react";
import { BoardSwitcher } from "@/components/BoardSwitcher";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { ChatPanel } from "@/components/ChatPanel";
import { CollaboratorsPanel } from "@/components/CollaboratorsPanel";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginScreen } from "@/components/LoginScreen";
import {
  ApiError,
  createBoard,
  deleteBoard,
  fetchMe,
  getBoard,
  listBoards,
  logout as logoutRequest,
  updateBoard,
  type AuthPayload,
  type BoardResponse,
  type BoardSummary,
} from "@/lib/api";
import { hasBoardData, initialData, type BoardData } from "@/lib/kanban";
import { clearSession, loadSession, saveSession, type Session } from "@/lib/session";

// A board the current user just created is always one they own.
const toOwnedBoardSummary = (board: BoardResponse, ownerUsername: string): BoardSummary => ({
  id: board.id,
  name: board.name,
  updated_at: board.updated_at,
  is_owner: true,
  owner_username: ownerUsername,
});

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [isRestoringSession, setIsRestoringSession] = useState(() => loadSession() !== null);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [board, setBoard] = useState<BoardData>(initialData);
  const [isActiveBoardOwner, setIsActiveBoardOwner] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [showSharePanel, setShowSharePanel] = useState(false);

  useEffect(() => {
    const stored = loadSession();
    if (!stored) {
      return;
    }

    fetchMe(stored.token)
      .then(() => setSession(stored))
      .catch(() => clearSession())
      .finally(() => setIsRestoringSession(false));
  }, []);

  const selectBoard = (token: string, boardId: string) => {
    getBoard(token, boardId)
      .then((response) => {
        setLoadError(false);
        setActiveBoardId(response.id);
        setIsActiveBoardOwner(response.is_owner);
        setShowSharePanel(false);
        setBoard(hasBoardData(response.board) ? response.board : initialData);
      })
      .catch(() => setLoadError(true));
  };

  useEffect(() => {
    if (!session) {
      return;
    }

    listBoards(session.token)
      .then(async (existingBoards) => {
        setLoadError(false);
        if (existingBoards.length === 0) {
          const created = await createBoard(session.token, "My board");
          setBoards([toOwnedBoardSummary(created, session.username)]);
          setActiveBoardId(created.id);
          setIsActiveBoardOwner(true);
          setBoard(created.board);
          return;
        }

        setBoards(existingBoards);
        selectBoard(session.token, existingBoards[0].id);
      })
      .catch(() => setLoadError(true));
  }, [session]);

  const handleAuthenticated = (payload: AuthPayload) => {
    const nextSession = { token: payload.token, userId: payload.user_id, username: payload.username };
    saveSession(nextSession);
    setSession(nextSession);
  };

  const handleLogout = () => {
    if (session) {
      logoutRequest(session.token).catch(() => undefined);
    }
    clearSession();
    setSession(null);
    setBoards([]);
    setActiveBoardId(null);
    setBoard(initialData);
    setShowAccountForm(false);
    setShowSharePanel(false);
  };

  const refreshBoards = (token: string) =>
    listBoards(token)
      .then(setBoards)
      .catch(() => setLoadError(true));

  const handleSelectBoard = (boardId: string) => {
    if (!session) {
      return;
    }
    selectBoard(session.token, boardId);
  };

  const handleCreateBoard = (name: string) => {
    if (!session) {
      return;
    }
    createBoard(session.token, name)
      .then((created) => {
        setBoards((prev) => [toOwnedBoardSummary(created, session.username), ...prev]);
        setActiveBoardId(created.id);
        setIsActiveBoardOwner(true);
        setShowSharePanel(false);
        setBoard(created.board);
      })
      .catch(() => setLoadError(true));
  };

  const handleRenameBoard = (boardId: string, name: string) => {
    if (!session) {
      return;
    }
    updateBoard(session.token, boardId, { name })
      .then(() => refreshBoards(session.token))
      .catch(() => setLoadError(true));
  };

  const handleDeleteBoard = (boardId: string) => {
    if (!session) {
      return;
    }
    deleteBoard(session.token, boardId)
      .then(async () => {
        const remaining = boards.filter((existing) => existing.id !== boardId);
        if (boardId === activeBoardId) {
          if (remaining.length > 0) {
            selectBoard(session.token, remaining[0].id);
          } else {
            const created = await createBoard(session.token, "My board");
            remaining.push(toOwnedBoardSummary(created, session.username));
            setActiveBoardId(created.id);
            setIsActiveBoardOwner(true);
            setShowSharePanel(false);
            setBoard(created.board);
          }
        }
        setBoards(remaining);
      })
      .catch((error) => {
        if (!(error instanceof ApiError && error.status === 404)) {
          setLoadError(true);
        }
      });
  };

  if (isRestoringSession) {
    return null;
  }

  if (!session) {
    return <LoginScreen onAuthenticated={handleAuthenticated} />;
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <div className="relative mx-auto flex max-w-[1920px] flex-col gap-6 px-4 pb-10 pt-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <BoardSwitcher
            boards={boards}
            activeBoardId={activeBoardId}
            onSelect={handleSelectBoard}
            onCreate={handleCreateBoard}
            onRename={handleRenameBoard}
            onDelete={handleDeleteBoard}
          />
          <div className="flex flex-col items-start sm:items-end">
            <div className="flex items-center gap-3 text-sm text-[var(--gray-text)]">
              <span>{session.username}</span>
              {activeBoardId ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowSharePanel((prev) => !prev);
                    setShowAccountForm(false);
                  }}
                  className="rounded-full border border-[var(--stroke)] px-4 py-2 font-semibold text-[var(--navy-dark)]"
                >
                  Share
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setShowAccountForm((prev) => !prev);
                  setShowSharePanel(false);
                }}
                className="rounded-full border border-[var(--stroke)] px-4 py-2 font-semibold text-[var(--navy-dark)]"
              >
                Account
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-full border border-[var(--stroke)] px-4 py-2 font-semibold text-[var(--navy-dark)]"
              >
                Sign out
              </button>
            </div>
            {showAccountForm ? (
              <ChangePasswordForm
                token={session.token}
                onClose={() => setShowAccountForm(false)}
              />
            ) : null}
            {showSharePanel && activeBoardId ? (
              <CollaboratorsPanel
                token={session.token}
                boardId={activeBoardId}
                isOwner={isActiveBoardOwner}
                onClose={() => setShowSharePanel(false)}
              />
            ) : null}
          </div>
        </div>

        {loadError ? (
          <p className="rounded-2xl border border-[var(--stroke)] bg-white/80 px-4 py-3 text-sm font-semibold text-[var(--secondary-purple)]">
            Could not reach the server. Showing local changes only until the connection is restored.
          </p>
        ) : null}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
          <div className="min-w-0 flex-1">
            <KanbanBoard
              board={board}
              onBoardChange={setBoard}
              boardId={activeBoardId}
              token={session.token}
            />
          </div>
          <div className="w-full lg:sticky lg:top-6 lg:w-[380px] lg:flex-shrink-0">
            <ChatPanel
              board={board}
              boardId={activeBoardId}
              token={session.token}
              onBoardUpdate={setBoard}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
