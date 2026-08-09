"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { API_BASE } from "@/lib/config";
import type { BoardData } from "@/lib/kanban";

type Message = {
  id: number;
  role: "assistant" | "user";
  text: string;
};

type ChatPanelProps = {
  board: BoardData;
  userId: string | null;
  onBoardUpdate: (board: BoardData) => void;
};

export const ChatPanel = ({ board, userId, onBoardUpdate }: ChatPanelProps) => {
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, role: "assistant", text: "Hello! I can help review the board." },
  ]);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [boardUpdated, setBoardUpdated] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!boardUpdated) {
      return;
    }

    const timer = window.setTimeout(() => setBoardUpdated(false), 3000);
    return () => window.clearTimeout(timer);
  }, [boardUpdated]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const prompt = draft.trim();
    if (!prompt) {
      return;
    }

    const nextMessage: Message = { id: messages.length + 1, role: "user", text: prompt };
    const nextMessages = [...messages, nextMessage];
    setMessages(nextMessages);
    setDraft("");
    setError(null);

    if (!userId) {
      setError("Unable to send message without a signed-in user.");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          board,
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.text,
          })),
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Chat request failed: ${response.status} ${body}`);
      }

      const payload = await response.json();
      setMessages((prev) => [
        ...prev,
        { id: prev.length + 1, role: "assistant", text: payload.assistant_message },
      ]);

      if (payload.board) {
        onBoardUpdate(payload.board);
        setBoardUpdated(true);
      }
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : "Unknown error";
      setError(message);
      setMessages((prev) => [
        ...prev,
        { id: prev.length + 1, role: "assistant", text: `Error: ${message}` },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <aside className="rounded-[32px] border border-[var(--stroke)] bg-white/80 p-4 shadow-[var(--shadow)] backdrop-blur">
      <h2 className="font-display text-xl font-semibold text-[var(--navy-dark)]">Assistant</h2>
      <div className="mt-4 flex h-72 flex-col gap-3 overflow-y-auto rounded-2xl bg-[var(--surface)] p-3">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${message.role === "user" ? "ml-auto bg-[var(--primary-blue)] text-white" : "bg-white text-[var(--navy-dark)]"}`}
          >
            {message.text}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="flex-1 rounded-full border border-[var(--stroke)] px-3 py-2 text-sm outline-none"
          placeholder="Type a message"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading}
          className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white disabled:opacity-50"
        >
          {isLoading ? "Sending..." : "Send"}
        </button>
      </form>
      {boardUpdated ? (
        <p className="mt-3 text-sm text-green-700">Board updated by AI.</p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </aside>
  );
};
