"use client";

import { useEffect, useState } from "react";
import { ChatPanel } from "@/components/ChatPanel";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginScreen } from "@/components/LoginScreen";
import type { BoardData } from "@/lib/kanban";

const API_BASE = "http://127.0.0.1:8000";

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [board, setBoard] = useState<BoardData>({ columns: [], cards: {} });

  useEffect(() => {
    if (!userId) {
      return;
    }

    fetch(`${API_BASE}/api/board?user_id=${encodeURIComponent(userId)}`)
      .then((response) => response.json())
      .then((payload) => {
        if (payload.board) {
          setBoard(payload.board);
        }
      })
      .catch(() => undefined);
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
      <KanbanBoard board={board} onBoardChange={setBoard} userId={userId} />
      <ChatPanel board={board} userId={userId} onBoardUpdate={setBoard} />
    </div>
  );
}
