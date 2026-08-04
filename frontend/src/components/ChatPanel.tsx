"use client";

import { useState, type FormEvent } from "react";

type Message = {
  id: number;
  role: "assistant" | "user";
  text: string;
};

export const ChatPanel = () => {
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, role: "assistant", text: "Hello! I can help review the board." },
  ]);
  const [draft, setDraft] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.trim()) {
      return;
    }

    setMessages((prev) => [
      ...prev,
      { id: prev.length + 1, role: "user", text: draft.trim() },
      { id: prev.length + 2, role: "assistant", text: `You asked: ${draft.trim()}` },
    ]);
    setDraft("");
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
      </div>
      <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="flex-1 rounded-full border border-[var(--stroke)] px-3 py-2 text-sm outline-none"
          placeholder="Type a message"
        />
        <button
          type="submit"
          className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white"
        >
          Send
        </button>
      </form>
    </aside>
  );
};
