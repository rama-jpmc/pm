"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { sendChatMessage } from "@/lib/api";
import type { BoardData } from "@/lib/kanban";

type Message = {
  id: number;
  role: "assistant" | "user";
  text: string;
};

type ChatPanelProps = {
  board: BoardData;
  boardId: string | null;
  token: string | null;
  onBoardUpdate: (board: BoardData) => void;
};

export const ChatPanel = ({ board, boardId, token, onBoardUpdate }: ChatPanelProps) => {
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, role: "assistant", text: "Hello! I can help review the board." },
  ]);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [boardUpdated, setBoardUpdated] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const boardRef = useRef(board);

  useEffect(() => {
    boardRef.current = board;
  }, [board]);

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

    if (!token || !boardId) {
      setError("Unable to send message without a signed-in user.");
      return;
    }

    // Snapshot the board this request is reasoning about, so we can tell
    // if the user edits the board while the request is in flight (the
    // OpenRouter round trip can take up to ~30s) and avoid clobbering
    // those edits with a suggestion computed from stale state.
    const submittedBoard = board;
    setIsLoading(true);

    try {
      const payload = await sendChatMessage(
        token,
        boardId,
        board,
        nextMessages.map((message) => ({ role: message.role, content: message.text }))
      );

      setMessages((prev) => [
        ...prev,
        { id: prev.length + 1, role: "assistant", text: payload.assistant_message },
      ]);

      if (payload.board) {
        if (boardRef.current === submittedBoard) {
          onBoardUpdate(payload.board);
          setBoardUpdated(true);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: prev.length + 1,
              role: "assistant",
              text: "The board changed while I was working, so I didn't apply this update automatically. Ask again if you'd still like it applied.",
            },
          ]);
        }
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
    <aside className="flex max-h-[calc(100vh-3rem)] flex-col rounded-[32px] border border-[var(--stroke)] bg-white/80 p-4 shadow-[var(--shadow)] backdrop-blur">
      <h2 className="font-display text-xl font-semibold text-[var(--navy-dark)]">Assistant</h2>
      <div className="mt-4 flex h-[420px] flex-1 flex-col gap-3 overflow-y-auto rounded-2xl bg-[var(--surface)] p-3">
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
        <p className="mt-3 text-sm font-semibold text-[var(--primary-blue)]">Board updated by AI.</p>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm font-semibold text-[var(--secondary-purple)]">{error}</p>
      ) : null}
    </aside>
  );
};
