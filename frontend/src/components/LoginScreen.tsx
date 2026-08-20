"use client";

import { useState, type FormEvent } from "react";
import { ApiError, login, register, type AuthPayload } from "@/lib/api";

type LoginScreenProps = {
  onAuthenticated: (payload: AuthPayload) => void;
};

type Mode = "login" | "register";

export const LoginScreen = ({ onAuthenticated }: LoginScreenProps) => {
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const payload =
        mode === "login" ? await login(username, password) : await register(username, password);
      onAuthenticated(payload);
    } catch (submitError) {
      if (submitError instanceof ApiError && submitError.status === 401) {
        setError("Invalid username or password.");
      } else if (submitError instanceof ApiError && submitError.status === 409) {
        setError("That username is already taken.");
      } else if (submitError instanceof ApiError) {
        setError(submitError.message);
      } else {
        setError("Unable to reach the server.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleMode = () => {
    setMode((current) => (current === "login" ? "register" : "login"));
    setError(null);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-6 py-12">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-[32px] border border-[var(--stroke)] bg-white p-8 shadow-[var(--shadow)]"
      >
        <h1 className="font-display text-3xl font-semibold text-[var(--navy-dark)]">
          {mode === "login" ? "Sign in" : "Create an account"}
        </h1>
        <p className="mt-3 text-sm text-[var(--gray-text)]">
          {mode === "login"
            ? "Sign in to see your boards."
            : "Register an account to start creating boards."}
        </p>
        <label className="mt-6 block text-sm font-semibold text-[var(--navy-dark)]" htmlFor="username">
          Username
        </label>
        <input
          id="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
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
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          className="mt-2 w-full rounded-2xl border border-[var(--stroke)] px-4 py-3"
        />
        {error ? (
          <p className="mt-4 text-sm font-semibold text-[var(--secondary-purple)]">{error}</p>
        ) : null}
        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-6 w-full rounded-full bg-[var(--secondary-purple)] px-4 py-3 text-sm font-semibold uppercase tracking-wide text-white disabled:opacity-50"
        >
          {isSubmitting ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}
        </button>
        <button
          type="button"
          onClick={toggleMode}
          className="mt-4 w-full text-center text-sm font-semibold text-[var(--primary-blue)]"
        >
          {mode === "login" ? "Need an account? Register" : "Already have an account? Sign in"}
        </button>
      </form>
    </div>
  );
};
