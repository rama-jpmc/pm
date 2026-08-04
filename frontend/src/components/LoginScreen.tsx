"use client";

import { useState, type FormEvent } from "react";

type LoginScreenProps = {
  onLogin: (username: string) => void;
};

export const LoginScreen = ({ onLogin }: LoginScreenProps) => {
  const [username, setUsername] = useState("user");
  const [password, setPassword] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (username === "user" && password === "password") {
      onLogin(username);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-6 py-12">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-[32px] border border-[var(--stroke)] bg-white p-8 shadow-[var(--shadow)]"
      >
        <h1 className="font-display text-3xl font-semibold text-[var(--navy-dark)]">
          Sign in
        </h1>
        <p className="mt-3 text-sm text-[var(--gray-text)]">
          Use the demo credentials user / password.
        </p>
        <label className="mt-6 block text-sm font-semibold text-[var(--navy-dark)]" htmlFor="username">
          Username
        </label>
        <input
          id="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className="mt-2 w-full rounded-2xl border border-[var(--stroke)] px-4 py-3"
        />
        <label className="mt-4 block text-sm font-semibold text-[var(--navy-dark)]" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-2 w-full rounded-2xl border border-[var(--stroke)] px-4 py-3"
        />
        <button
          type="submit"
          className="mt-6 w-full rounded-full bg-[var(--secondary-purple)] px-4 py-3 text-sm font-semibold uppercase tracking-wide text-white"
        >
          Sign in
        </button>
      </form>
    </div>
  );
};
