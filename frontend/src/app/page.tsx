"use client";

import { useEffect, useState } from "react";
import { ChatPanel } from "@/components/ChatPanel";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginScreen } from "@/components/LoginScreen";
import { API_BASE } from "@/lib/config";
import { hasBoardData, initialData, type BoardData } from "@/lib/kanban";

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [board, setBoard] = useState<BoardData>(initialData);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!userId) {
      return;
    }

    fetch(`${API_BASE}/api/board?user_id=${encodeURIComponent(userId)}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load board: ${response.status}`);
        }
        return response.json();
      })
      .then((payload) => {
        setLoadError(false);
        if (hasBoardData(payload.board)) {
          setBoard(payload.board);
        }
      })
      .catch(() => setLoadError(true));
  }, [userId]);

  const handleLogin = (nextUserId: string) => {
    setUserId(nextUserId);
    setIsAuthenticated(true);
  };

  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <div className="relative mx-auto flex max-w-[1920px] flex-col gap-6 px-4 pb-10 pt-6 sm:px-6 lg:px-8">
        {loadError ? (
          <p className="rounded-2xl border border-[var(--stroke)] bg-white/80 px-4 py-3 text-sm font-semibold text-[var(--secondary-purple)]">
            Could not load your saved board from the server. Showing local changes only until the connection is restored.
          </p>
        ) : null}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
          <div className="min-w-0 flex-1">
            <KanbanBoard board={board} onBoardChange={setBoard} userId={userId} />
          </div>
          <div className="w-full lg:sticky lg:top-6 lg:w-[380px] lg:flex-shrink-0">
            <ChatPanel board={board} userId={userId} onBoardUpdate={setBoard} />
          </div>
        </div>
      </div>
    </div>
  );
}
