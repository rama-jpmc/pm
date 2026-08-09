"use client";

import { useEffect, useState } from "react";
import { ChatPanel } from "@/components/ChatPanel";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginScreen } from "@/components/LoginScreen";
import { API_BASE } from "@/lib/config";
import { initialData, type BoardData } from "@/lib/kanban";

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [board, setBoard] = useState<BoardData>(initialData);

  useEffect(() => {
    if (!userId) {
      return;
    }

    fetch(`${API_BASE}/api/board?user_id=${encodeURIComponent(userId)}`)
      .then((response) => response.json())
      .then((payload) => {
        if (payload.board && payload.board.columns.length > 0) {
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
