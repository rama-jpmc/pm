from __future__ import annotations

import json
import os
import re
import sqlite3
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

APP_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_ROOT = APP_ROOT.parent / "frontend" / "out"
DB_PATH = APP_ROOT / "data" / "kanban.db"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)


def get_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db() -> None:
    with get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS boards (
                user_id TEXT PRIMARY KEY,
                board_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        connection.commit()


init_db()

app = FastAPI(title="Project Management MVP API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class BoardPayload(BaseModel):
    user_id: str
    board: dict[str, Any]


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    user_id: str
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
        if isinstance(board_candidate, dict) and "columns" in board_candidate and "cards" in board_candidate:
            board_update = board_candidate

    return assistant_message, board_update


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/board")
def get_board(user_id: str = Query(...)) -> dict[str, Any]:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT board_json FROM boards WHERE user_id = ?",
            (user_id,),
        ).fetchone()

    if row is None:
        return {
            "user_id": user_id,
            "board": {"columns": [], "cards": {}},
        }

    return {"user_id": user_id, "board": json.loads(row["board_json"])}


def persist_board(user_id: str, board: dict[str, Any]) -> None:
    serialized_board = json.dumps(board)

    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO boards (user_id, board_json, updated_at)
            VALUES (?, ?, datetime('now'))
            ON CONFLICT(user_id) DO UPDATE SET
                board_json = excluded.board_json,
                updated_at = datetime('now')
            """,
            (user_id, serialized_board),
        )
        connection.commit()


@app.post("/api/board")
def save_board(payload: BoardPayload) -> dict[str, Any]:
    persist_board(payload.user_id, payload.board)
    return {"status": "saved", "user_id": payload.user_id}


@app.post("/api/chat", response_model=ChatResponse)
def chat(payload: ChatRequest) -> ChatResponse:
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
            "https://api.openrouter.ai/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": "openai/gpt-oss-120b",
                "messages": [
                    {"role": "system", "content": system_message},
                    {"role": "user", "content": user_message},
                ],
                "temperature": 0.3,
                "max_tokens": 800,
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
        persist_board(payload.user_id, board_update)

    return ChatResponse(assistant_message=assistant_message, board=board_update)


if FRONTEND_ROOT.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_ROOT), html=True), name="frontend")
