import json
import sqlite3
import tempfile
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

import app.main as main_module
from app.main import app


client = TestClient(app)


def register(username: str, password: str = "password123") -> dict:
    response = client.post(
        "/api/auth/register", json={"username": username, "password": password}
    )
    assert response.status_code == 201, response.text
    return response.json()


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def create_board(token: str, name: str = "My board") -> dict:
    response = client.post("/api/boards", json={"name": name}, headers=auth_headers(token))
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture
def user(request):
    username = f"user-{request.node.name}"
    return register(username)


def test_health_endpoint():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_init_db_migrates_legacy_single_board_schema(monkeypatch):
    legacy_db_path = Path(tempfile.mkdtemp()) / "legacy.db"
    connection = sqlite3.connect(legacy_db_path)
    connection.execute(
        """
        CREATE TABLE boards (
            user_id TEXT PRIMARY KEY,
            board_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    connection.execute(
        "INSERT INTO boards (user_id, board_json, updated_at) VALUES (?, ?, datetime('now'))",
        ("legacy-user", "{}"),
    )
    connection.commit()
    connection.close()

    monkeypatch.setattr(main_module, "DB_PATH", legacy_db_path)
    main_module.init_db()

    migrated = sqlite3.connect(legacy_db_path)
    columns = {row[1] for row in migrated.execute("PRAGMA table_info(boards)")}
    migrated.close()
    assert "id" in columns
    assert "user_id" in columns


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


def test_register_creates_user_and_returns_token():
    payload = register("register-new-user")
    assert payload["username"] == "register-new-user"
    assert payload["token"]
    assert payload["user_id"]


def test_register_rejects_duplicate_username():
    register("register-dup")
    response = client.post(
        "/api/auth/register", json={"username": "register-dup", "password": "pw"}
    )
    assert response.status_code == 409


def test_register_rejects_empty_username_or_password():
    response = client.post("/api/auth/register", json={"username": "  ", "password": "pw"})
    assert response.status_code == 422

    response = client.post("/api/auth/register", json={"username": "someone", "password": ""})
    assert response.status_code == 422


def test_login_succeeds_with_correct_credentials():
    register("login-good", "correct-password")
    response = client.post(
        "/api/auth/login", json={"username": "login-good", "password": "correct-password"}
    )
    assert response.status_code == 200
    assert response.json()["username"] == "login-good"


def test_login_rejects_wrong_password():
    register("login-bad-password", "correct-password")
    response = client.post(
        "/api/auth/login", json={"username": "login-bad-password", "password": "wrong"}
    )
    assert response.status_code == 401


def test_login_rejects_unknown_username():
    response = client.post(
        "/api/auth/login", json={"username": "does-not-exist", "password": "whatever"}
    )
    assert response.status_code == 401


def test_me_requires_auth():
    response = client.get("/api/auth/me")
    assert response.status_code == 401


def test_me_rejects_invalid_token():
    response = client.get("/api/auth/me", headers=auth_headers("not-a-real-token"))
    assert response.status_code == 401


def test_me_rejects_bearer_prefix_with_no_token():
    response = client.get("/api/auth/me", headers={"Authorization": "Bearer "})
    assert response.status_code == 401


def test_me_returns_current_user(user):
    response = client.get("/api/auth/me", headers=auth_headers(user["token"]))
    assert response.status_code == 200
    assert response.json() == {"user_id": user["user_id"], "username": user["username"]}


def test_logout_invalidates_token(user):
    response = client.post("/api/auth/logout", headers=auth_headers(user["token"]))
    assert response.status_code == 200

    response = client.get("/api/auth/me", headers=auth_headers(user["token"]))
    assert response.status_code == 401


def test_change_password_requires_auth():
    response = client.put(
        "/api/auth/password",
        json={"current_password": "a", "new_password": "b"},
    )
    assert response.status_code == 401


def test_change_password_rejects_wrong_current_password():
    user_data = register("password-wrong-current", "original-pw")
    response = client.put(
        "/api/auth/password",
        json={"current_password": "not-it", "new_password": "new-password"},
        headers=auth_headers(user_data["token"]),
    )
    assert response.status_code == 401


def test_change_password_rejects_empty_new_password():
    user_data = register("password-empty-new", "original-pw")
    response = client.put(
        "/api/auth/password",
        json={"current_password": "original-pw", "new_password": ""},
        headers=auth_headers(user_data["token"]),
    )
    assert response.status_code == 422


def test_change_password_succeeds_and_new_password_can_login():
    user_data = register("password-change-success", "original-pw")
    response = client.put(
        "/api/auth/password",
        json={"current_password": "original-pw", "new_password": "updated-pw"},
        headers=auth_headers(user_data["token"]),
    )
    assert response.status_code == 200

    old_password_login = client.post(
        "/api/auth/login",
        json={"username": "password-change-success", "password": "original-pw"},
    )
    assert old_password_login.status_code == 401

    new_password_login = client.post(
        "/api/auth/login",
        json={"username": "password-change-success", "password": "updated-pw"},
    )
    assert new_password_login.status_code == 200


# ---------------------------------------------------------------------------
# Boards
# ---------------------------------------------------------------------------


def test_create_board_requires_auth():
    response = client.post("/api/boards", json={"name": "No auth"})
    assert response.status_code == 401


def test_create_and_list_boards(user):
    headers = auth_headers(user["token"])
    create_board(user["token"], "Board One")
    create_board(user["token"], "Board Two")

    response = client.get("/api/boards", headers=headers)
    assert response.status_code == 200
    names = {board["name"] for board in response.json()}
    assert names == {"Board One", "Board Two"}


def test_new_board_starts_empty(user):
    board = create_board(user["token"])
    assert board["board"] == {"columns": [], "cards": {}}
    assert board["name"] == "My board"


def test_get_missing_board_returns_404(user):
    response = client.get("/api/boards/does-not-exist", headers=auth_headers(user["token"]))
    assert response.status_code == 404


def test_update_board_persists_name_and_content():
    owner = register("board-update-owner")
    board = create_board(owner["token"])

    response = client.put(
        f"/api/boards/{board['id']}",
        json={
            "name": "Renamed board",
            "board": {
                "columns": [{"id": "col-1", "title": "Backlog", "cardIds": ["card-1"]}],
                "cards": {"card-1": {"id": "card-1", "title": "T", "details": "D"}},
            },
        },
        headers=auth_headers(owner["token"]),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Renamed board"
    assert body["board"]["columns"][0]["title"] == "Backlog"

    reloaded = client.get(f"/api/boards/{board['id']}", headers=auth_headers(owner["token"]))
    assert reloaded.json()["name"] == "Renamed board"


def test_update_board_rejects_invalid_board_payload():
    owner = register("board-update-invalid")
    board = create_board(owner["token"])

    response = client.put(
        f"/api/boards/{board['id']}",
        json={
            "board": {
                "columns": [{"id": "col-1", "title": "Backlog", "cardIds": ["ghost"]}],
                "cards": {},
            }
        },
        headers=auth_headers(owner["token"]),
    )
    assert response.status_code == 422


def test_update_board_accepts_card_priority_and_due_date():
    owner = register("board-update-priority")
    board = create_board(owner["token"])

    response = client.put(
        f"/api/boards/{board['id']}",
        json={
            "board": {
                "columns": [{"id": "col-1", "title": "Backlog", "cardIds": ["card-1"]}],
                "cards": {
                    "card-1": {
                        "id": "card-1",
                        "title": "T",
                        "details": "D",
                        "priority": "high",
                        "dueDate": "2026-09-01",
                    }
                },
            }
        },
        headers=auth_headers(owner["token"]),
    )
    assert response.status_code == 200
    card = response.json()["board"]["cards"]["card-1"]
    assert card["priority"] == "high"
    assert card["dueDate"] == "2026-09-01"


def test_update_board_rejects_invalid_priority():
    owner = register("board-update-bad-priority")
    board = create_board(owner["token"])

    response = client.put(
        f"/api/boards/{board['id']}",
        json={
            "board": {
                "columns": [{"id": "col-1", "title": "Backlog", "cardIds": ["card-1"]}],
                "cards": {
                    "card-1": {"id": "card-1", "title": "T", "details": "D", "priority": "urgent"}
                },
            }
        },
        headers=auth_headers(owner["token"]),
    )
    assert response.status_code == 422


@pytest.mark.parametrize(
    "board",
    [
        "not-a-dict",
        {"columns": "not-a-list", "cards": {}},
        {"columns": [], "cards": "not-a-dict"},
        {"columns": ["not-a-dict"], "cards": {}},
        {"columns": [{"id": "col-1", "title": "Backlog", "cardIds": "not-a-list"}], "cards": {}},
        {
            "columns": [{"id": "col-1", "title": "Backlog", "cardIds": ["card-1"]}],
            "cards": {"card-1": "not-a-dict"},
        },
        {
            "columns": [],
            "cards": {"card-1": {"id": "card-1", "title": "T", "details": "D", "dueDate": 123}},
        },
    ],
)
def test_update_board_rejects_various_malformed_boards(board):
    owner = register(f"board-update-malformed-{hash(str(board))}")
    created = create_board(owner["token"])

    response = client.put(
        f"/api/boards/{created['id']}",
        json={"board": board},
        headers=auth_headers(owner["token"]),
    )
    assert response.status_code == 422


def test_delete_board_removes_it():
    owner = register("board-delete-owner")
    board = create_board(owner["token"])

    response = client.delete(f"/api/boards/{board['id']}", headers=auth_headers(owner["token"]))
    assert response.status_code == 204

    response = client.get(f"/api/boards/{board['id']}", headers=auth_headers(owner["token"]))
    assert response.status_code == 404


def test_board_access_is_scoped_to_owner():
    owner = register("board-scope-owner")
    other = register("board-scope-other")
    board = create_board(owner["token"])

    response = client.get(f"/api/boards/{board['id']}", headers=auth_headers(other["token"]))
    assert response.status_code == 403

    response = client.put(
        f"/api/boards/{board['id']}",
        json={"name": "Hijacked"},
        headers=auth_headers(other["token"]),
    )
    assert response.status_code == 403

    response = client.delete(f"/api/boards/{board['id']}", headers=auth_headers(other["token"]))
    assert response.status_code == 403


def test_lists_only_own_boards():
    owner = register("board-list-owner")
    other = register("board-list-other")
    create_board(owner["token"], "Owner board")
    create_board(other["token"], "Other board")

    response = client.get("/api/boards", headers=auth_headers(owner["token"]))
    names = {board["name"] for board in response.json()}
    assert names == {"Owner board"}


def test_board_summary_and_response_report_ownership():
    owner = register("board-ownership-owner")
    board = create_board(owner["token"])

    list_response = client.get("/api/boards", headers=auth_headers(owner["token"]))
    summary = next(b for b in list_response.json() if b["id"] == board["id"])
    assert summary["is_owner"] is True
    assert summary["owner_username"] == "board-ownership-owner"

    get_response = client.get(f"/api/boards/{board['id']}", headers=auth_headers(owner["token"]))
    assert get_response.json()["is_owner"] is True


# ---------------------------------------------------------------------------
# Collaborators
# ---------------------------------------------------------------------------


def test_owner_can_add_list_and_remove_a_collaborator():
    owner = register("collab-owner-1")
    guest = register("collab-guest-1")
    board = create_board(owner["token"])

    add_response = client.post(
        f"/api/boards/{board['id']}/collaborators",
        json={"username": "collab-guest-1"},
        headers=auth_headers(owner["token"]),
    )
    assert add_response.status_code == 201
    assert [c["username"] for c in add_response.json()] == ["collab-guest-1"]

    list_response = client.get(
        f"/api/boards/{board['id']}/collaborators", headers=auth_headers(owner["token"])
    )
    assert [c["username"] for c in list_response.json()] == ["collab-guest-1"]

    remove_response = client.delete(
        f"/api/boards/{board['id']}/collaborators/{guest['user_id']}",
        headers=auth_headers(owner["token"]),
    )
    assert remove_response.status_code == 204

    list_after_remove = client.get(
        f"/api/boards/{board['id']}/collaborators", headers=auth_headers(owner["token"])
    )
    assert list_after_remove.json() == []


def test_non_owner_cannot_manage_collaborators():
    owner = register("collab-owner-2")
    guest = register("collab-guest-2")
    outsider = register("collab-outsider-2")
    board = create_board(owner["token"])

    add_response = client.post(
        f"/api/boards/{board['id']}/collaborators",
        json={"username": "collab-outsider-2"},
        headers=auth_headers(guest["token"]),
    )
    assert add_response.status_code == 403

    # Make outsider a collaborator so we can prove even collaborators can't
    # remove other collaborators or the owner.
    client.post(
        f"/api/boards/{board['id']}/collaborators",
        json={"username": "collab-outsider-2"},
        headers=auth_headers(owner["token"]),
    )
    remove_response = client.delete(
        f"/api/boards/{board['id']}/collaborators/{outsider['user_id']}",
        headers=auth_headers(guest["token"]),
    )
    assert remove_response.status_code == 403


def test_add_collaborator_rejects_unknown_username():
    owner = register("collab-owner-3")
    board = create_board(owner["token"])

    response = client.post(
        f"/api/boards/{board['id']}/collaborators",
        json={"username": "does-not-exist"},
        headers=auth_headers(owner["token"]),
    )
    assert response.status_code == 404


def test_add_collaborator_rejects_the_owner_themselves():
    owner = register("collab-owner-4")
    board = create_board(owner["token"])

    response = client.post(
        f"/api/boards/{board['id']}/collaborators",
        json={"username": "collab-owner-4"},
        headers=auth_headers(owner["token"]),
    )
    assert response.status_code == 422


def test_collaborator_can_read_and_edit_but_not_delete_board():
    owner = register("collab-owner-5")
    guest = register("collab-guest-5")
    board = create_board(owner["token"])
    client.post(
        f"/api/boards/{board['id']}/collaborators",
        json={"username": "collab-guest-5"},
        headers=auth_headers(owner["token"]),
    )

    get_response = client.get(f"/api/boards/{board['id']}", headers=auth_headers(guest["token"]))
    assert get_response.status_code == 200
    assert get_response.json()["is_owner"] is False

    update_response = client.put(
        f"/api/boards/{board['id']}",
        json={"name": "Renamed by guest"},
        headers=auth_headers(guest["token"]),
    )
    assert update_response.status_code == 200
    assert update_response.json()["name"] == "Renamed by guest"

    delete_response = client.delete(
        f"/api/boards/{board['id']}", headers=auth_headers(guest["token"])
    )
    assert delete_response.status_code == 403


def test_shared_board_appears_in_collaborators_board_list():
    owner = register("collab-owner-6")
    guest = register("collab-guest-6")
    board = create_board(owner["token"], "Shared board")
    client.post(
        f"/api/boards/{board['id']}/collaborators",
        json={"username": "collab-guest-6"},
        headers=auth_headers(owner["token"]),
    )

    list_response = client.get("/api/boards", headers=auth_headers(guest["token"]))
    shared = next(b for b in list_response.json() if b["id"] == board["id"])
    assert shared["is_owner"] is False
    assert shared["owner_username"] == "collab-owner-6"


def test_collaborator_management_requires_board_access():
    owner = register("collab-owner-7")
    outsider = register("collab-outsider-7")
    board = create_board(owner["token"])

    response = client.get(
        f"/api/boards/{board['id']}/collaborators", headers=auth_headers(outsider["token"])
    )
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------


def test_chat_endpoint_requires_auth():
    response = client.post(
        "/api/chat",
        json={"board_id": "whatever", "board": {"columns": [], "cards": {}}, "messages": []},
    )
    assert response.status_code == 401


def test_chat_endpoint_rejects_board_owned_by_another_user(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test")
    owner = register("chat-scope-owner")
    other = register("chat-scope-other")
    board = create_board(owner["token"])

    response = client.post(
        "/api/chat",
        json={
            "board_id": board["id"],
            "board": {"columns": [], "cards": {}},
            "messages": [{"role": "user", "content": "hi"}],
        },
        headers=auth_headers(other["token"]),
    )
    assert response.status_code == 403


def test_chat_endpoint_parses_ai_response(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test")
    owner = register("chat-parses")
    board = create_board(owner["token"])

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
            "board_id": board["id"],
            "board": {"columns": [], "cards": {}},
            "messages": [
                {"role": "assistant", "content": "Hello! I can help review the board."},
                {"role": "user", "content": "Please improve the board."},
            ],
        },
        headers=auth_headers(owner["token"]),
    )

    assert response.status_code == 200
    assert response.json() == {
        "assistant_message": "Board updated",
        "board": {"columns": [], "cards": {}},
    }

    persisted_response = client.get(
        f"/api/boards/{board['id']}", headers=auth_headers(owner["token"])
    )
    assert persisted_response.status_code == 200
    assert persisted_response.json()["board"] == {"columns": [], "cards": {}}


def test_chat_endpoint_posts_to_correct_openrouter_url(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test")
    owner = register("chat-url-check")
    board = create_board(owner["token"])
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
            "board_id": board["id"],
            "board": {"columns": [], "cards": {}},
            "messages": [{"role": "user", "content": "hi"}],
        },
        headers=auth_headers(owner["token"]),
    )

    assert response.status_code == 200
    assert captured["url"] == "https://openrouter.ai/api/v1/chat/completions"


def test_chat_endpoint_requires_api_key(monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    owner = register("chat-no-key")
    board = create_board(owner["token"])

    response = client.post(
        "/api/chat",
        json={
            "board_id": board["id"],
            "board": {"columns": [], "cards": {}},
            "messages": [{"role": "user", "content": "hi"}],
        },
        headers=auth_headers(owner["token"]),
    )

    assert response.status_code == 500


def test_chat_endpoint_handles_plain_text_response(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test")
    owner = register("chat-plain-text")
    board = create_board(owner["token"])

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
            "board_id": board["id"],
            "board": {"columns": [], "cards": {}},
            "messages": [{"role": "user", "content": "hi"}],
        },
        headers=auth_headers(owner["token"]),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["assistant_message"] == "Sure, happy to help with the board."
    assert body["board"] is None


def test_chat_endpoint_handles_malformed_json(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test")
    owner = register("chat-malformed")
    board = create_board(owner["token"])

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
            "board_id": board["id"],
            "board": {"columns": [], "cards": {}},
            "messages": [{"role": "user", "content": "hi"}],
        },
        headers=auth_headers(owner["token"]),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["board"] is None
    assert body["assistant_message"] == '{"assistant_message": "Board updated", "board":'


def test_chat_endpoint_handles_balanced_but_invalid_json(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test")
    owner = register("chat-invalid-json")
    board = create_board(owner["token"])

    def fake_post(*args, **kwargs):
        class FakeResponse:
            status_code = 200

            def json(self):
                # Braces are balanced (extract_json_object will find this),
                # but single-quoted keys make it invalid JSON syntax.
                return {"choices": [{"message": {"content": "{'assistant_message': 'hi'}"}}]}

        return FakeResponse()

    monkeypatch.setattr(httpx, "post", fake_post)

    response = client.post(
        "/api/chat",
        json={
            "board_id": board["id"],
            "board": {"columns": [], "cards": {}},
            "messages": [{"role": "user", "content": "hi"}],
        },
        headers=auth_headers(owner["token"]),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["board"] is None
    assert body["assistant_message"] == "{'assistant_message': 'hi'}"


def test_chat_endpoint_handles_response_missing_choices(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test")
    owner = register("chat-missing-choices")
    board = create_board(owner["token"])

    def fake_post(*args, **kwargs):
        class FakeResponse:
            status_code = 200

            def json(self):
                return {}

        return FakeResponse()

    monkeypatch.setattr(httpx, "post", fake_post)

    response = client.post(
        "/api/chat",
        json={
            "board_id": board["id"],
            "board": {"columns": [], "cards": {}},
            "messages": [{"role": "user", "content": "hi"}],
        },
        headers=auth_headers(owner["token"]),
    )

    assert response.status_code == 502


def test_chat_endpoint_ignores_incomplete_board(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test")
    owner = register("chat-incomplete-board")
    board = create_board(owner["token"])

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
            "board_id": board["id"],
            "board": {"columns": [], "cards": {}},
            "messages": [{"role": "user", "content": "hi"}],
        },
        headers=auth_headers(owner["token"]),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["assistant_message"] == "Here you go"
    assert body["board"] is None


def test_chat_endpoint_ignores_board_with_dangling_card_id(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test")
    owner = register("chat-dangling-card")
    board = create_board(owner["token"])

    def fake_post(*args, **kwargs):
        class FakeResponse:
            status_code = 200

            def json(self):
                return {
                    "choices": [
                        {
                            "message": {
                                "content": json.dumps(
                                    {
                                        "assistant_message": "Added it",
                                        "board": {
                                            "columns": [
                                                {
                                                    "id": "col-1",
                                                    "title": "Backlog",
                                                    "cardIds": ["ghost-card"],
                                                }
                                            ],
                                            "cards": {},
                                        },
                                    }
                                )
                            }
                        }
                    ]
                }

        return FakeResponse()

    monkeypatch.setattr(httpx, "post", fake_post)

    response = client.post(
        "/api/chat",
        json={
            "board_id": board["id"],
            "board": {"columns": [], "cards": {}},
            "messages": [{"role": "user", "content": "add a card"}],
        },
        headers=auth_headers(owner["token"]),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["assistant_message"] == "Added it"
    assert body["board"] is None

    persisted_response = client.get(
        f"/api/boards/{board['id']}", headers=auth_headers(owner["token"])
    )
    assert persisted_response.json()["board"] == {"columns": [], "cards": {}}


def test_chat_endpoint_handles_upstream_connection_error(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test")
    owner = register("chat-connect-error")
    board = create_board(owner["token"])

    def fake_post(*args, **kwargs):
        raise httpx.ConnectError("connection failed")

    monkeypatch.setattr(httpx, "post", fake_post)

    response = client.post(
        "/api/chat",
        json={
            "board_id": board["id"],
            "board": {"columns": [], "cards": {}},
            "messages": [{"role": "user", "content": "hi"}],
        },
        headers=auth_headers(owner["token"]),
    )

    assert response.status_code == 502


def test_chat_endpoint_handles_non_200_upstream_status(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test")
    owner = register("chat-bad-status")
    board = create_board(owner["token"])

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
            "board_id": board["id"],
            "board": {"columns": [], "cards": {}},
            "messages": [{"role": "user", "content": "hi"}],
        },
        headers=auth_headers(owner["token"]),
    )

    assert response.status_code == 502
