const STORAGE_KEY = "pm.session";

export type Session = {
  token: string;
  userId: string;
  username: string;
};

export const loadSession = (): Session | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
};

export const saveSession = (session: Session) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
};

export const clearSession = () => {
  window.localStorage.removeItem(STORAGE_KEY);
};
