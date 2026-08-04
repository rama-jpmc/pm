from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Query
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


@app.post("/api/board")
def save_board(payload: BoardPayload) -> dict[str, Any]:
    serialized_board = json.dumps(payload.board)

    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO boards (user_id, board_json, updated_at)
            VALUES (?, ?, datetime('now'))
            ON CONFLICT(user_id) DO UPDATE SET
                board_json = excluded.board_json,
                updated_at = datetime('now')
            """,
            (payload.user_id, serialized_board),
        )
        connection.commit()

    return {"status": "saved", "user_id": payload.user_id}


if FRONTEND_ROOT.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_ROOT), html=True), name="frontend")
