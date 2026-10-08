from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from app.core.settings import settings
from tests.test_workflows import P, admitted, data, headers, transition


def payload(revision):
    return {
        "edits": [
            {
                "wiki": "enwiki",
                "title": "Mars",
                "editor": "Editor",
                "old_rev": 0,
                "new_rev": revision,
                "page_id": 42,
                "occurred_at": datetime.now(timezone.utc).isoformat(),
            }
        ]
    }


def test_last_queue_slot_is_atomic(client, auth, monkeypatch):
    monkeypatch.setattr(settings, "queue_capacity", 1)
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(
            pool.map(
                lambda revision: client.post(
                    P + "/edits/admit", headers=headers(auth), json=payload(revision)
                ),
                [21, 22],
            )
        )
    assert sorted(response.status_code for response in responses) == [200, 409]
    assert data(client.get(P + "/edits", headers=headers(auth)))["total"] == 1
    assert (
        data(client.get(P + "/events", headers=headers(auth)))["items"][0]["kind"]
        == "edit.admitted"
    )


def test_archiving_cannot_bypass_total_storage_limit(client, auth, monkeypatch):
    monkeypatch.setattr(settings, "edit_capacity", 1)
    edit = admitted(client, auth)[0]
    data(
        client.post(
            P + f"/edits/{edit['id']}/archive",
            headers=headers(auth, "noor"),
            json={"version": edit["version"]},
        )
    )
    assert (
        client.post(P + "/edits/admit", headers=headers(auth), json=payload(99)).status_code == 409
    )
    assert data(client.get(P + "/edits?archived=true", headers=headers(auth)))["total"] == 1


def test_history_limit_rolls_back_business_change(client, auth, monkeypatch):
    edit = admitted(client, auth)[0]
    monkeypatch.setattr(settings, "audit_capacity", 1)
    assert transition(client, auth, edit, "claim").status_code == 409
    current = data(client.get(P + f"/edits/{edit['id']}", headers=headers(auth)))
    assert current["status"] == "unclaimed" and current["version"] == 1
    assert len(data(client.get(P + "/events", headers=headers(auth)))["items"]) == 1


def test_comments_and_deleted_threads_remain_bounded(client, auth, monkeypatch):
    edit = admitted(client, auth)[0]
    monkeypatch.setattr(settings, "threads_per_edit", 1)
    monkeypatch.setattr(settings, "comments_per_thread", 2)
    path = P + f"/edits/{edit['id']}/threads"
    body = {
        "body": "Question",
        "anchor": {
            "wiki": "enwiki",
            "old_rev": 10,
            "new_rev": 20,
            "side": "new",
            "start_line": 1,
            "end_line": 1,
        },
    }
    thread = data(client.post(path, headers=headers(auth), json=body))
    assert client.post(path, headers=headers(auth), json=body).status_code == 409
    replies = P + f"/threads/{thread['id']}/comments"
    data(client.post(replies, headers=headers(auth), json={"body": "Reply"}))
    assert client.post(replies, headers=headers(auth), json={"body": "Another"}).status_code == 409
    assert len(data(client.get(path, headers=headers(auth)))["items"][0]["comments"]) == 2
    data(
        client.request(
            "DELETE", P + f"/threads/{thread['id']}", headers=headers(auth), json={"version": 2}
        )
    )
    assert client.post(path, headers=headers(auth), json=body).status_code == 409


def test_sessions_are_bounded_and_rotation_frees_revoked_rows(client, auth, monkeypatch):
    monkeypatch.setattr(settings, "sessions_per_member", 1)
    body = {"email": "dev@example.org", "password": "test-password-123"}
    assert client.post(P + "/auth/login", json=body).status_code == 409
    refreshed = data(
        client.post(P + "/auth/refresh", json={"refresh_token": auth["dev"]["refresh_token"]})
    )
    assert client.get(P + "/auth/me", headers=headers(auth)).status_code == 401
    assert (
        client.get(
            P + "/auth/me", headers={"Authorization": "Bearer " + refreshed["access_token"]}
        ).status_code
        == 200
    )


def test_refresh_token_has_one_winner(client, auth):
    with ThreadPoolExecutor(max_workers=2) as pool:
        replies = list(
            pool.map(
                lambda _: client.post(
                    P + "/auth/refresh", json={"refresh_token": auth["dev"]["refresh_token"]}
                ),
                range(2),
            )
        )
    assert sorted(response.status_code for response in replies) == [200, 401]


def test_oversized_and_chunked_requests_reject_before_writes(client, auth, monkeypatch):
    monkeypatch.setattr(settings, "request_bytes", 1024)
    assert (
        client.post(P + "/edits/admit", headers=headers(auth), content=b"x" * 1025).status_code
        == 413
    )
    assert (
        client.post(
            P + "/edits/admit", headers=headers(auth), content=iter([b"x" * 600, b"x" * 600])
        ).status_code
        == 413
    )
    assert data(client.get(P + "/edits", headers=headers(auth)))["total"] == 0


def test_cursor_head_and_selected_export(client, auth):
    admitted(client, auth, 3)
    head = data(client.get(P + "/events?latest=true", headers=headers(auth)))
    assert head == {"items": [], "next_cursor": 3, "has_more": False}
    assert not data(client.get(P + "/events?after=3", headers=headers(auth)))["items"]
    recent = data(client.get(P + "/audit?newest=true&limit=2", headers=headers(auth, "noor")))
    assert [row["id"] for row in recent["items"]] == [3, 2]
    export = client.get(P + "/audit/export?ids=2&limit=1000", headers=headers(auth, "noor"))
    assert export.status_code == 200 and len(export.text.splitlines()) == 2
    assert client.get(P + "/audit/export?ids=abc", headers=headers(auth, "noor")).status_code == 422


def test_reply_returns_authoritative_thread_version(client, auth):
    edit = admitted(client, auth)[0]
    thread = data(
        client.post(
            P + f"/edits/{edit['id']}/threads",
            headers=headers(auth),
            json={
                "body": "Question",
                "anchor": {
                    "wiki": "enwiki",
                    "old_rev": 10,
                    "new_rev": 20,
                    "side": "new",
                    "start_line": 1,
                    "end_line": 1,
                },
            },
        )
    )
    path = P + f"/threads/{thread['id']}/comments"
    first = data(client.post(path, headers=headers(auth, "sara"), json={"body": "Lead reply"}))
    second = data(client.post(path, headers=headers(auth), json={"body": "Reviewer reply"}))
    assert first["thread_version"] == 2 and second["thread_version"] == 3
    updated = data(
        client.patch(
            P + f"/threads/{thread['id']}",
            headers=headers(auth),
            json={"version": second["thread_version"], "resolved": True},
        )
    )
    assert updated["version"] == 4 and len(updated["comments"]) == 3


def test_request_admission_rejects_excess_work_and_releases_slots(monkeypatch):
    import asyncio

    from fastapi.responses import JSONResponse

    from app.middlewares import ResourceGuard

    monkeypatch.setattr(settings, "concurrent_requests", 2)

    async def check():
        release = asyncio.Event()
        entered = 0

        async def application(scope, receive, send):
            nonlocal entered
            entered += 1
            await release.wait()
            await JSONResponse({"ok": True})(scope, receive, send)

        guard = ResourceGuard(application)
        scope = {"type": "http", "method": "GET", "path": "/"}

        async def request():
            messages = []

            async def receive():
                return {"type": "http.request", "body": b"", "more_body": False}

            async def send(message):
                messages.append(message)

            await guard(scope, receive, send)
            return messages[0]["status"]

        running = [asyncio.create_task(request()) for _ in range(2)]
        while entered < 2:
            await asyncio.sleep(0)
        assert await request() == 503
        assert guard.active == 2
        release.set()
        assert await asyncio.gather(*running) == [200, 200]
        assert guard.active == 0
        assert await request() == 200

    asyncio.run(check())


def test_export_crosses_batches_and_preserves_csv(client, auth):
    import csv
    import io

    from app.core.database import SessionLocal
    from app.models import Audit

    async def seed():
        async with SessionLocal() as db:
            db.add_all(
                [
                    Audit(
                        actor_id="noor",
                        action="=formula",
                        target=f"row,{i}",
                        detail={"reason": '測🙂\nquoted "text"'},
                    )
                    for i in range(205)
                ]
            )
            await db.commit()

    client.portal.call(seed)
    response = client.get(P + "/audit/export?after_id=3&limit=201", headers=headers(auth, "noor"))
    assert response.status_code == 200
    rows = list(csv.reader(io.StringIO(response.content.decode("utf-8"))))
    assert len(rows) == 202
    assert [int(row[0]) for row in rows[1:]] == list(range(4, 205))
    assert all(row[3] == "'=formula" for row in rows[1:])
    assert "測🙂" in rows[1][5] and "quoted" in rows[1][5]
    assert rows[1][4] == "row,3"
