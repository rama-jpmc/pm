import { API_BASE } from "@/lib/config";
import type { BoardData } from "@/lib/kanban";

export type AuthPayload = { token: string; user_id: string; username: string };
export type MePayload = { user_id: string; username: string };
export type BoardSummary = {
  id: string;
  name: string;
  updated_at: string;
  is_owner: boolean;
  owner_username: string;
};
export type BoardResponse = {
  id: string;
  name: string;
  board: BoardData;
  updated_at: string;
  is_owner: boolean;
};
export type Collaborator = { user_id: string; username: string };
export type ChatMessagePayload = { role: string; content: string };
export type ChatResponse = { assistant_message: string; board: BoardData | null };

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json();
      detail = body?.detail ?? "";
    } catch {
      detail = "";
    }
    throw new ApiError(response.status, detail || `Request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const register = (username: string, password: string) =>
  request<AuthPayload>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });

export const login = (username: string, password: string) =>
  request<AuthPayload>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });

export const logout = (token: string) =>
  request<{ status: string }>("/api/auth/logout", { method: "POST" }, token);

export const fetchMe = (token: string) => request<MePayload>("/api/auth/me", {}, token);

export const changePassword = (token: string, currentPassword: string, newPassword: string) =>
  request<{ status: string }>(
    "/api/auth/password",
    {
      method: "PUT",
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    },
    token
  );

export const listBoards = (token: string) => request<BoardSummary[]>("/api/boards", {}, token);

export const createBoard = (token: string, name: string) =>
  request<BoardResponse>(
    "/api/boards",
    { method: "POST", body: JSON.stringify({ name }) },
    token
  );

export const getBoard = (token: string, boardId: string) =>
  request<BoardResponse>(`/api/boards/${boardId}`, {}, token);

export const updateBoard = (
  token: string,
  boardId: string,
  payload: { name?: string; board?: BoardData }
) =>
  request<BoardResponse>(
    `/api/boards/${boardId}`,
    { method: "PUT", body: JSON.stringify(payload) },
    token
  );

export const deleteBoard = (token: string, boardId: string) =>
  request<void>(`/api/boards/${boardId}`, { method: "DELETE" }, token);

export const listCollaborators = (token: string, boardId: string) =>
  request<Collaborator[]>(`/api/boards/${boardId}/collaborators`, {}, token);

export const addCollaborator = (token: string, boardId: string, username: string) =>
  request<Collaborator[]>(
    `/api/boards/${boardId}/collaborators`,
    { method: "POST", body: JSON.stringify({ username }) },
    token
  );

export const removeCollaborator = (token: string, boardId: string, userId: string) =>
  request<void>(`/api/boards/${boardId}/collaborators/${userId}`, { method: "DELETE" }, token);

export const sendChatMessage = (
  token: string,
  boardId: string,
  board: BoardData,
  messages: ChatMessagePayload[]
) =>
  request<ChatResponse>(
    "/api/chat",
    { method: "POST", body: JSON.stringify({ board_id: boardId, board, messages }) },
    token
  );
