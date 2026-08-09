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


def test_chat_endpoint_posts_to_correct_openrouter_url(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test")
    captured = {}

    def fake_post(url, *args, **kwargs):
        captured["url"] = url

        class FakeResponse:
            status_code = 200

            def json(self):
                return {"choices": [{"message": {"content": "Hello there"}}]}

        return FakeResponse()

    monkeypatch.setattr(httpx, "post", fake_post)

    response = client.post(
        "/api/chat",
        json={
            "user_id": "demo-url-check",
            "board": {"columns": [], "cards": {}},
            "messages": [{"role": "user", "content": "hi"}],
        },
    )

    assert response.status_code == 200
    assert captured["url"] == "https://openrouter.ai/api/v1/chat/completions"


def test_chat_endpoint_requires_api_key(monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

    response = client.post(
        "/api/chat",
        json={
            "user_id": "demo-no-key",
            "board": {"columns": [], "cards": {}},
            "messages": [{"role": "user", "content": "hi"}],
        },
    )

    assert response.status_code == 500


def test_chat_endpoint_handles_plain_text_response(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test")

    def fake_post(*args, **kwargs):
        class FakeResponse:
            status_code = 200

            def json(self):
                return {
                    "choices": [
                        {"message": {"content": "Sure, happy to help with the board."}}
                    ]
                }

        return FakeResponse()

    monkeypatch.setattr(httpx, "post", fake_post)

    response = client.post(
        "/api/chat",
        json={
            "user_id": "demo-plain-text",
            "board": {"columns": [], "cards": {}},
            "messages": [{"role": "user", "content": "hi"}],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["assistant_message"] == "Sure, happy to help with the board."
    assert body["board"] is None


def test_chat_endpoint_handles_malformed_json(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test")

    def fake_post(*args, **kwargs):
        class FakeResponse:
            status_code = 200

            def json(self):
                return {
                    "choices": [
                        {
                            "message": {
                                "content": '{"assistant_message": "Board updated", "board": '
                            }
                        }
                    ]
                }

        return FakeResponse()

    monkeypatch.setattr(httpx, "post", fake_post)

    response = client.post(
        "/api/chat",
        json={
            "user_id": "demo-malformed",
            "board": {"columns": [], "cards": {}},
            "messages": [{"role": "user", "content": "hi"}],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["board"] is None
    assert body["assistant_message"] == '{"assistant_message": "Board updated", "board":'


def test_chat_endpoint_ignores_incomplete_board(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test")

    def fake_post(*args, **kwargs):
        class FakeResponse:
            status_code = 200

            def json(self):
                return {
                    "choices": [
                        {
                            "message": {
                                "content": '{"assistant_message": "Here you go", "board": {"columns": []}}'
                            }
                        }
                    ]
                }

        return FakeResponse()

    monkeypatch.setattr(httpx, "post", fake_post)

    response = client.post(
        "/api/chat",
        json={
            "user_id": "demo-incomplete-board",
            "board": {"columns": [], "cards": {}},
            "messages": [{"role": "user", "content": "hi"}],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["assistant_message"] == "Here you go"
    assert body["board"] is None


def test_chat_endpoint_handles_upstream_connection_error(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test")

    def fake_post(*args, **kwargs):
        raise httpx.ConnectError("connection failed")

    monkeypatch.setattr(httpx, "post", fake_post)

    response = client.post(
        "/api/chat",
        json={
            "user_id": "demo-connect-error",
            "board": {"columns": [], "cards": {}},
            "messages": [{"role": "user", "content": "hi"}],
        },
    )

    assert response.status_code == 502


def test_chat_endpoint_handles_non_200_upstream_status(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test")

    def fake_post(*args, **kwargs):
        class FakeResponse:
            status_code = 500

            def json(self):
                return {}

        return FakeResponse()

    monkeypatch.setattr(httpx, "post", fake_post)

    response = client.post(
        "/api/chat",
        json={
            "user_id": "demo-bad-status",
            "board": {"columns": [], "cards": {}},
            "messages": [{"role": "user", "content": "hi"}],
        },
    )

    assert response.status_code == 502
