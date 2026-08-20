from __future__ import annotations

import json
import os
import secrets
import sqlite3
import uuid
from pathlib import Path
from typing import Annotated, Any

import bcrypt
import httpx
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

APP_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = APP_ROOT.parent
FRONTEND_ROOT = PROJECT_ROOT / "frontend" / "out"
DB_PATH = Path(os.environ.get("KANBAN_DB_PATH", str(APP_ROOT / "data" / "kanban.db")))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

load_dotenv(PROJECT_ROOT / ".env")

EMPTY_BOARD: dict[str, Any] = {"columns": [], "cards": {}}


def get_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def _table_columns(connection: sqlite3.Connection, table: str) -> set[str]:
    return {row["name"] for row in connection.execute(f"PRAGMA table_info({table})")}


def init_db() -> None:
    with get_connection() as connection:
        # Earlier schema had a single `boards(user_id PRIMARY KEY, ...)` row per
        # user. This is a local dev database only (no production data), so on
        # detecting the old shape we drop and recreate rather than migrating.
        existing_board_columns = _table_columns(connection, "boards")
        if existing_board_columns and "id" not in existing_board_columns:
            connection.execute("DROP TABLE boards")

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS boards (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                board_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS board_collaborators (
                board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                added_at TEXT NOT NULL,
                PRIMARY KEY (board_id, user_id)
            )
            """
        )
        connection.commit()


init_db()

app = FastAPI(title="Project Management API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


class RegisterRequest(BaseModel):
    username: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


class AuthResponse(BaseModel):
    token: str
    user_id: str
    username: str


class MeResponse(BaseModel):
    user_id: str
    username: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def create_session(connection: sqlite3.Connection, user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    connection.execute(
        "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, datetime('now'))",
        (token, user_id),
    )
    return token


class CurrentUser(BaseModel):
    id: str
    username: str


def get_current_user(authorization: Annotated[str | None, Header()] = None) -> CurrentUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")

    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing bearer token")

    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT users.id AS id, users.username AS username
            FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.token = ?
            """,
            (token,),
        ).fetchone()

    if row is None:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    return CurrentUser(id=row["id"], username=row["username"])


CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]


@app.post("/api/auth/register", response_model=AuthResponse, status_code=201)
def register(payload: RegisterRequest) -> AuthResponse:
    username = payload.username.strip()
    if not username or not payload.password:
        raise HTTPException(status_code=422, detail="Username and password are required")

    user_id = uuid.uuid4().hex
    password_hash = hash_password(payload.password)

    with get_connection() as connection:
        try:
            connection.execute(
                "INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, datetime('now'))",
                (user_id, username, password_hash),
            )
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail="Username is already taken")

        token = create_session(connection, user_id)
        connection.commit()

    return AuthResponse(token=token, user_id=user_id, username=username)


@app.post("/api/auth/login", response_model=AuthResponse)
def login(payload: LoginRequest) -> AuthResponse:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT id, username, password_hash FROM users WHERE username = ?",
            (payload.username.strip(),),
        ).fetchone()

        if row is None or not verify_password(payload.password, row["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid username or password")

        token = create_session(connection, row["id"])
        connection.commit()

    return AuthResponse(token=token, user_id=row["id"], username=row["username"])


@app.post("/api/auth/logout")
def logout(
    current_user: CurrentUserDep,
    authorization: Annotated[str | None, Header()] = None,
) -> dict[str, str]:
    token = (authorization or "").removeprefix("Bearer ").strip()
    with get_connection() as connection:
        connection.execute("DELETE FROM sessions WHERE token = ?", (token,))
        connection.commit()
    return {"status": "logged_out"}


@app.get("/api/auth/me", response_model=MeResponse)
def me(current_user: CurrentUserDep) -> MeResponse:
    return MeResponse(user_id=current_user.id, username=current_user.username)


@app.put("/api/auth/password")
def change_password(payload: ChangePasswordRequest, current_user: CurrentUserDep) -> dict[str, str]:
    if not payload.new_password:
        raise HTTPException(status_code=422, detail="New password is required")

    with get_connection() as connection:
        row = connection.execute(
            "SELECT password_hash FROM users WHERE id = ?", (current_user.id,)
        ).fetchone()

        if row is None or not verify_password(payload.current_password, row["password_hash"]):
            raise HTTPException(status_code=401, detail="Current password is incorrect")

        connection.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (hash_password(payload.new_password), current_user.id),
        )
        connection.commit()

    return {"status": "password_updated"}


# ---------------------------------------------------------------------------
# Boards
# ---------------------------------------------------------------------------


class BoardCreateRequest(BaseModel):
    name: str = "Untitled board"


class BoardUpdateRequest(BaseModel):
    name: str | None = None
    board: dict[str, Any] | None = None


class BoardSummary(BaseModel):
    id: str
    name: str
    updated_at: str
    is_owner: bool
    owner_username: str


class BoardResponse(BaseModel):
    id: str
    name: str
    board: dict[str, Any]
    updated_at: str
    is_owner: bool


class AddCollaboratorRequest(BaseModel):
    username: str


class CollaboratorResponse(BaseModel):
    user_id: str
    username: str


def is_valid_board(board: Any) -> bool:
    """Validate the BoardData invariant: every column.cardIds entry must
    reference a card that exists in `cards`, each card id must appear in at
    most one column, and each card must round-trip its own id."""
    if not isinstance(board, dict):
        return False

    columns = board.get("columns")
    cards = board.get("cards")
    if not isinstance(columns, list) or not isinstance(cards, dict):
        return False

    seen_card_ids: set[str] = set()
    for column in columns:
        if not isinstance(column, dict):
            return False
        if not isinstance(column.get("id"), str) or not isinstance(column.get("title"), str):
            return False
        card_ids = column.get("cardIds")
        if not isinstance(card_ids, list):
            return False
        for card_id in card_ids:
            if not isinstance(card_id, str) or card_id not in cards or card_id in seen_card_ids:
                return False
            seen_card_ids.add(card_id)

    for card_id, card in cards.items():
        if not isinstance(card, dict) or card.get("id") != card_id:
            return False
        if not isinstance(card.get("title"), str) or not isinstance(card.get("details"), str):
            return False
        if "priority" in card and card["priority"] is not None and card["priority"] not in (
            "low",
            "medium",
            "high",
        ):
            return False
        if "dueDate" in card and card["dueDate"] is not None and not isinstance(card["dueDate"], str):
            return False

    return True


def _row_to_board_response(row: sqlite3.Row, user_id: str) -> BoardResponse:
    return BoardResponse(
        id=row["id"],
        name=row["name"],
        board=json.loads(row["board_json"]),
        updated_at=row["updated_at"],
        is_owner=row["user_id"] == user_id,
    )


def _fetch_board_row(connection: sqlite3.Connection, board_id: str) -> sqlite3.Row:
    row = connection.execute(
        "SELECT id, user_id, name, board_json, updated_at FROM boards WHERE id = ?",
        (board_id,),
    ).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Board not found")

    return row


def is_board_collaborator(connection: sqlite3.Connection, board_id: str, user_id: str) -> bool:
    row = connection.execute(
        "SELECT 1 FROM board_collaborators WHERE board_id = ? AND user_id = ?",
        (board_id, user_id),
    ).fetchone()
    return row is not None


def get_owned_board_row(connection: sqlite3.Connection, board_id: str, user_id: str) -> sqlite3.Row:
    """Owner-only access, for destructive actions and collaborator management."""
    row = _fetch_board_row(connection, board_id)
    if row["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Only the board owner can do this")
    return row


def get_accessible_board_row(connection: sqlite3.Connection, board_id: str, user_id: str) -> sqlite3.Row:
    """Owner or collaborator access, for reading/editing board content."""
    row = _fetch_board_row(connection, board_id)
    if row["user_id"] != user_id and not is_board_collaborator(connection, board_id, user_id):
        raise HTTPException(status_code=403, detail="You do not have access to this board")
    return row


@app.get("/api/boards", response_model=list[BoardSummary])
def list_boards(current_user: CurrentUserDep) -> list[BoardSummary]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT boards.id AS id, boards.name AS name, boards.updated_at AS updated_at,
                   boards.user_id AS owner_id, users.username AS owner_username
            FROM boards
            JOIN users ON users.id = boards.user_id
            WHERE boards.user_id = :uid
               OR boards.id IN (SELECT board_id FROM board_collaborators WHERE user_id = :uid)
            ORDER BY boards.updated_at DESC
            """,
            {"uid": current_user.id},
        ).fetchall()

    return [
        BoardSummary(
            id=row["id"],
            name=row["name"],
            updated_at=row["updated_at"],
            is_owner=row["owner_id"] == current_user.id,
            owner_username=row["owner_username"],
        )
        for row in rows
    ]


@app.post("/api/boards", response_model=BoardResponse, status_code=201)
def create_board(payload: BoardCreateRequest, current_user: CurrentUserDep) -> BoardResponse:
    board_id = uuid.uuid4().hex
    name = payload.name.strip() or "Untitled board"

    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO boards (id, user_id, name, board_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
            """,
            (board_id, current_user.id, name, json.dumps(EMPTY_BOARD)),
        )
        connection.commit()
        row = get_accessible_board_row(connection, board_id, current_user.id)

    return _row_to_board_response(row, current_user.id)


@app.get("/api/boards/{board_id}", response_model=BoardResponse)
def get_board(board_id: str, current_user: CurrentUserDep) -> BoardResponse:
    with get_connection() as connection:
        row = get_accessible_board_row(connection, board_id, current_user.id)

    return _row_to_board_response(row, current_user.id)


@app.put("/api/boards/{board_id}", response_model=BoardResponse)
def update_board(board_id: str, payload: BoardUpdateRequest, current_user: CurrentUserDep) -> BoardResponse:
    if payload.board is not None and not is_valid_board(payload.board):
        raise HTTPException(status_code=422, detail="Invalid board payload")

    with get_connection() as connection:
        row = get_accessible_board_row(connection, board_id, current_user.id)

        name = payload.name.strip() if payload.name is not None and payload.name.strip() else row["name"]
        board_json = json.dumps(payload.board) if payload.board is not None else row["board_json"]

        connection.execute(
            "UPDATE boards SET name = ?, board_json = ?, updated_at = datetime('now') WHERE id = ?",
            (name, board_json, board_id),
        )
        connection.commit()
        row = get_accessible_board_row(connection, board_id, current_user.id)

    return _row_to_board_response(row, current_user.id)


@app.delete("/api/boards/{board_id}", status_code=204)
def delete_board(board_id: str, current_user: CurrentUserDep) -> None:
    with get_connection() as connection:
        get_owned_board_row(connection, board_id, current_user.id)
        connection.execute("DELETE FROM boards WHERE id = ?", (board_id,))
        connection.commit()


@app.get("/api/boards/{board_id}/collaborators", response_model=list[CollaboratorResponse])
def list_collaborators(board_id: str, current_user: CurrentUserDep) -> list[CollaboratorResponse]:
    with get_connection() as connection:
        get_accessible_board_row(connection, board_id, current_user.id)
        rows = connection.execute(
            """
            SELECT users.id AS user_id, users.username AS username
            FROM board_collaborators
            JOIN users ON users.id = board_collaborators.user_id
            WHERE board_collaborators.board_id = ?
            ORDER BY users.username
            """,
            (board_id,),
        ).fetchall()

    return [CollaboratorResponse(user_id=row["user_id"], username=row["username"]) for row in rows]


@app.post(
    "/api/boards/{board_id}/collaborators",
    response_model=list[CollaboratorResponse],
    status_code=201,
)
def add_collaborator(
    board_id: str, payload: AddCollaboratorRequest, current_user: CurrentUserDep
) -> list[CollaboratorResponse]:
    with get_connection() as connection:
        board = get_owned_board_row(connection, board_id, current_user.id)

        target = connection.execute(
            "SELECT id, username FROM users WHERE username = ?",
            (payload.username.strip(),),
        ).fetchone()
        if target is None:
            raise HTTPException(status_code=404, detail="No user with that username")
        if target["id"] == board["user_id"]:
            raise HTTPException(status_code=422, detail="The board owner already has access")

        connection.execute(
            """
            INSERT OR IGNORE INTO board_collaborators (board_id, user_id, added_at)
            VALUES (?, ?, datetime('now'))
            """,
            (board_id, target["id"]),
        )
        connection.commit()

        rows = connection.execute(
            """
            SELECT users.id AS user_id, users.username AS username
            FROM board_collaborators
            JOIN users ON users.id = board_collaborators.user_id
            WHERE board_collaborators.board_id = ?
            ORDER BY users.username
            """,
            (board_id,),
        ).fetchall()

    return [CollaboratorResponse(user_id=row["user_id"], username=row["username"]) for row in rows]


@app.delete("/api/boards/{board_id}/collaborators/{user_id}", status_code=204)
def remove_collaborator(board_id: str, user_id: str, current_user: CurrentUserDep) -> None:
    with get_connection() as connection:
        get_owned_board_row(connection, board_id, current_user.id)
        connection.execute(
            "DELETE FROM board_collaborators WHERE board_id = ? AND user_id = ?",
            (board_id, user_id),
        )
        connection.commit()


def persist_board(board_id: str, user_id: str, board: dict[str, Any]) -> None:
    with get_connection() as connection:
        get_accessible_board_row(connection, board_id, user_id)
        connection.execute(
            "UPDATE boards SET board_json = ?, updated_at = datetime('now') WHERE id = ?",
            (json.dumps(board), board_id),
        )
        connection.commit()


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    board_id: str
    board: dict[str, Any]
    messages: list[ChatMessage]


class ChatResponse(BaseModel):
    assistant_message: str
    board: dict[str, Any] | None = None


def extract_json_object(raw_text: str) -> str | None:
    raw_text = raw_text.strip()
    start = raw_text.find("{")
    if start == -1:
        return None

    depth = 0
    in_string = False
    escape = False

    for index, char in enumerate(raw_text[start:], start=start):
        if char == "\"" and not escape:
            in_string = not in_string
        if in_string:
            escape = char == "\\" and not escape
            continue

        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return raw_text[start : index + 1]

    return None


def parse_ai_response_text(raw_text: str) -> tuple[str, dict[str, Any] | None]:
    assistant_message = raw_text.strip()
    board_update: dict[str, Any] | None = None

    json_text = extract_json_object(raw_text)
    if not json_text:
        return assistant_message, None

    try:
        payload = json.loads(json_text)
    except json.JSONDecodeError:
        return assistant_message, None

    if isinstance(payload, dict):
        assistant_message = str(payload.get("assistant_message", assistant_message)).strip()
        board_candidate = payload.get("board")
        if is_valid_board(board_candidate):
            board_update = board_candidate

    return assistant_message, board_update


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/chat", response_model=ChatResponse)
def chat(payload: ChatRequest, current_user: CurrentUserDep) -> ChatResponse:
    with get_connection() as connection:
        get_accessible_board_row(connection, payload.board_id, current_user.id)

    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENROUTER_API_KEY is not configured")

    system_message = (
        "You are a helpful assistant for a project management Kanban board. "
        "Use the board state and conversation history to decide whether the board needs to change. "
        "If the board should update, return the full updated board JSON. "
        "Always return valid JSON inside your response."
    )

    board_context = (
        "Current board state:\n" + json.dumps(payload.board, indent=2) +
        "\n\n"
    )

    conversation_content = "\n".join(
        f"{message.role}: {message.content}" for message in payload.messages
    )

    user_message = (
        board_context +
        "Conversation history:\n" + conversation_content +
        "\n\nReturn a JSON object with `assistant_message` and an optional `board` field. "
        "If the board does not need updating, omit the `board` field."
    )

    try:
        response = httpx.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": "openai/gpt-oss-120b",
                "messages": [
                    {"role": "system", "content": system_message},
                    {"role": "user", "content": user_message},
                ],
                "temperature": 0.3,
                "max_tokens": 800,
                "response_format": {"type": "json_object"},
            },
            timeout=30.0,
        )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"AI provider request failed: {exc}")

    if response.status_code != 200:
        raise HTTPException(status_code=502, detail="AI provider returned an error")

    try:
        data = response.json()
        assistant_text = data["choices"][0]["message"]["content"]
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=502, detail="Invalid response from AI provider")

    assistant_message, board_update = parse_ai_response_text(assistant_text)

    if board_update is not None:
        persist_board(payload.board_id, current_user.id, board_update)

    return ChatResponse(assistant_message=assistant_message, board=board_update)


if FRONTEND_ROOT.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_ROOT), html=True), name="frontend")
