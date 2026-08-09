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
    <div className="grid gap-6 lg:grid-cols-[1.8fr_0.7fr]">
      {loadError ? (
        <p className="lg:col-span-2 rounded-2xl border border-[var(--stroke)] bg-white/80 px-4 py-3 text-sm font-semibold text-[var(--secondary-purple)]">
          Could not load your saved board from the server. Showing local changes only until the connection is restored.
        </p>
      ) : null}
      <KanbanBoard board={board} onBoardChange={setBoard} userId={userId} />
      <ChatPanel board={board} userId={userId} onBoardUpdate={setBoard} />
    </div>
  );
}
