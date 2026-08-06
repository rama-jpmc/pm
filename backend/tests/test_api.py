import json
import os

import httpx
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health_endpoint():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_board_persistence_for_user():
    payload = {
        "user_id": "demo",
        "board": {
            "columns": [{"id": "col-1", "title": "Backlog", "cardIds": []}],
            "cards": {},
        },
    }

    response = client.post("/api/board", json=payload)
    assert response.status_code == 200

    load_response = client.get("/api/board", params={"user_id": "demo"})
    assert load_response.status_code == 200
    assert load_response.json()["board"]["columns"][0]["title"] == "Backlog"


def test_chat_endpoint_parses_ai_response(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test")

    def fake_post(*args, **kwargs):
        class FakeResponse:
            status_code = 200

            def json(self):
                return {
                    "choices": [
                        {
                            "message": {
                                "content": '{"assistant_message": "Board updated", "board": {"columns": [], "cards": {}}}'
                            }
                        }
                    ]
                }

        return FakeResponse()

    monkeypatch.setattr(httpx, "post", fake_post)

    response = client.post(
        "/api/chat",
        json={
            "user_id": "demo",
            "board": {"columns": [], "cards": {}},
            "messages": [
                {"role": "assistant", "content": "Hello! I can help review the board."},
                {"role": "user", "content": "Please improve the board."},
            ],
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "assistant_message": "Board updated",
        "board": {"columns": [], "cards": {}},
    }

    persisted_response = client.get("/api/board", params={"user_id": "demo"})
    assert persisted_response.status_code == 200
    assert persisted_response.json()["board"] == {"columns": [], "cards": {}}
