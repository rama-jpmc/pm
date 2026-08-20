"use client";

import { useState, type FormEvent } from "react";
import { ApiError, changePassword } from "@/lib/api";

type ChangePasswordFormProps = {
  token: string;
  onClose: () => void;
};

export const ChangePasswordForm = ({ token, onClose }: ChangePasswordFormProps) => {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    setIsSubmitting(true);

    try {
      await changePassword(token, currentPassword, newPassword);
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
    } catch (submitError) {
      if (submitError instanceof ApiError && submitError.status === 401) {
        setError("Current password is incorrect.");
      } else if (submitError instanceof ApiError) {
        setError(submitError.message);
      } else {
        setError("Unable to reach the server.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 w-full max-w-xs space-y-3 rounded-2xl border border-[var(--stroke)] bg-white p-4 shadow-[var(--shadow)]"
    >
      <label className="block text-xs font-semibold text-[var(--navy-dark)]" htmlFor="current-password">
        Current password
      </label>
      <input
        id="current-password"
        type="password"
        value={currentPassword}
        onChange={(event) => setCurrentPassword(event.target.value)}
        autoComplete="current-password"
        className="w-full rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm outline-none focus:border-[var(--primary-blue)]"
      />
      <label className="block text-xs font-semibold text-[var(--navy-dark)]" htmlFor="new-password">
        New password
      </label>
      <input
        id="new-password"
        type="password"
        value={newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
        autoComplete="new-password"
        className="w-full rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm outline-none focus:border-[var(--primary-blue)]"
      />
      {error ? (
        <p className="text-xs font-semibold text-[var(--secondary-purple)]">{error}</p>
      ) : null}
      {success ? (
        <p className="text-xs font-semibold text-[var(--primary-blue)]">Password updated.</p>
      ) : null}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-50"
        >
          {isSubmitting ? "Updating..." : "Update password"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]"
        >
          Close
        </button>
      </div>
    </form>
  );
};
