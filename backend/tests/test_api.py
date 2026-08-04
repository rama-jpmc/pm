import json

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
