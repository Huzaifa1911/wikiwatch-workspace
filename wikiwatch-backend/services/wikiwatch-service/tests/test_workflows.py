from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

P = "/wikiwatch-service/v1"


def headers(auth, user="dev"):
    return {"Authorization": "Bearer " + auth[user]["access_token"]}


def admitted(client, auth, count=1):
    response = client.post(
        P + "/edits/admit",
        headers=headers(auth),
        json={
            "edits": [
                {
                    "wiki": "enwiki",
                    "title": "Mars",
                    "editor": "Example",
                    "old_rev": 10 + i,
                    "new_rev": 20 + i,
                    "page_id": 42,
                    "occurred_at": datetime.now(timezone.utc).isoformat(),
                }
                for i in range(count)
            ]
        },
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]


def transition(client, auth, edit, operation, user="dev", **extra):
    return client.post(
        P + f"/edits/{edit['id']}/transition",
        headers=headers(auth, user),
        json={"operation": operation, "version": edit["version"], **extra},
    )


def data(response):
    assert response.status_code in (200, 201), response.text
    return response.json()["data"]


def test_review_return_verify_reopen_and_audit(client, auth):
    edit = admitted(client, auth)[0]
    edit = data(transition(client, auth, edit, "claim"))
    assert edit["status"] == "claimed"
    assert transition(client, auth, edit, "ok", "amir").status_code == 403
    assert transition(client, auth, edit, "flag").status_code == 422
    edit = data(transition(client, auth, edit, "flag", reason="Removed sourced content"))
    assert edit["status"] == "flagged"
    assert transition(client, auth, edit, "assign", "sara", owner_id="dev").status_code == 409
    assert transition(client, auth, edit, "return", "sara").status_code == 422
    edit = data(
        transition(client, auth, edit, "return", "sara", reason="Explain the removed source")
    )
    assert edit["return_reason"] == "Explain the removed source"
    edit = data(transition(client, auth, edit, "flag", reason="Source removal confirmed"))
    edit = data(transition(client, auth, edit, "verify", "sara"))
    assert edit["status"] == "verified_flagged"
    edit = data(transition(client, auth, edit, "reopen", "sara", reason="Check again"))
    edit = data(transition(client, auth, edit, "ok", reason="Valid change"))
    assert edit["status"] == "ok"
    rows = data(client.get(P + "/audit", headers=headers(auth, "noor")))["items"]
    assert len(rows) == 8
    assert rows[-1]["detail"]["to"] == "ok"
    events = data(client.get(P + "/events?limit=2", headers=headers(auth)))
    assert events["has_more"]
    next_events = data(
        client.get(P + "/events?after=" + str(events["next_cursor"]), headers=headers(auth))
    )
    assert all(e["id"] > events["next_cursor"] for e in next_events["items"])


def test_two_users_claim_once(client, auth):
    edit = admitted(client, auth)[0]
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(
            pool.map(lambda user: transition(client, auth, edit, "claim", user), ["dev", "amir"])
        )
    assert sorted(r.status_code for r in responses) == [200, 409]
    rows = data(client.get(P + "/audit?action=claim.claim", headers=headers(auth, "noor")))["items"]
    assert len(rows) == 1


def test_queue_dedupe_board_assignment_release(client, auth):
    edit = admitted(client, auth)[0]
    duplicate = admitted(client, auth)[0]
    assert edit["id"] == duplicate["id"]
    assert data(client.get(P + "/board", headers=headers(auth, "sara")))["counts"]["unclaimed"] == 1
    edit = data(transition(client, auth, edit, "assign", "sara", owner_id="amir"))
    assert edit["owner_id"] == "amir"
    assert transition(client, auth, edit, "assign", "dev", owner_id="dev").status_code == 403
    edit = data(transition(client, auth, edit, "release", "sara"))
    assert edit["status"] == "unclaimed" and edit["owner_id"] is None
    assert (
        data(client.get(P + "/edits?status=unclaimed&wiki=enwiki&q=Mars", headers=headers(auth)))[
            "total"
        ]
        == 1
    )
    assert len(data(client.get(P + "/workload", headers=headers(auth, "sara")))) == 2


def test_comments_anchor_plain_text_reply_resolution(client, auth):
    edit = data(transition(client, auth, admitted(client, auth)[0], "claim"))
    anchor = {
        "wiki": "enwiki",
        "old_rev": 10,
        "new_rev": 20,
        "side": "new",
        "start_line": 1,
        "end_line": 1,
        "start_offset": 0,
        "end_offset": 5,
        "quote": "<b>Ahmed</b>",
    }
    body = {"anchor": anchor, "body": "<img src=x onerror=alert(1)>"}
    path = P + f"/edits/{edit['id']}/threads"
    assert client.post(path, headers=headers(auth, "noor"), json=body).status_code == 403
    thread = data(client.post(path, headers=headers(auth), json=body))
    assert thread["comments"][0]["body"] == body["body"]
    assert thread["anchor"]["quote"] == anchor["quote"]
    assert (
        client.post(
            path, headers=headers(auth), json={**body, "anchor": {**anchor, "new_rev": 99}}
        ).status_code
        == 422
    )
    assert (
        client.post(
            P + f"/threads/{thread['id']}/comments", headers=headers(auth), json={"body": "   "}
        ).status_code
        == 422
    )
    data(
        client.post(
            P + f"/threads/{thread['id']}/comments",
            headers=headers(auth, "sara"),
            json={"body": "Please explain"},
        )
    )
    thread = data(client.get(path, headers=headers(auth)))["items"][0]
    assert len(thread["comments"]) == 2
    thread = data(
        client.patch(
            P + f"/threads/{thread['id']}",
            headers=headers(auth),
            json={"version": thread["version"], "resolved": True},
        )
    )
    assert (
        client.post(
            P + f"/threads/{thread['id']}/comments", headers=headers(auth), json={"body": "reply"}
        ).status_code
        == 409
    )
    assert (
        client.patch(
            P + f"/threads/{thread['id']}",
            headers=headers(auth),
            json={"version": 1, "resolved": False},
        ).status_code
        == 409
    )
    assert data(client.get(path, headers=headers(auth)))["items"][0]["resolved"]


def test_member_permissions_deactivation_and_duplicates(client, auth):
    payload = {
        "name": "New Person",
        "email": "new@example.org",
        "role": "reviewer",
        "password": "trainer-password-123",
    }
    assert (
        client.post(P + "/members", headers=headers(auth, "sara"), json=payload).status_code == 403
    )
    member = data(client.post(P + "/members", headers=headers(auth, "noor"), json=payload))
    assert "password_hash" not in member
    assert (
        client.post(
            P + "/members",
            headers=headers(auth, "noor"),
            json={**payload, "email": "NEW@example.org"},
        ).status_code
        == 409
    )
    assert (
        client.patch(
            P + "/members/noor", headers=headers(auth, "noor"), json={"active": False}
        ).status_code
        == 409
    )
    edit = data(transition(client, auth, admitted(client, auth)[0], "claim"))
    assert (
        client.patch(
            P + "/members/dev", headers=headers(auth, "noor"), json={"active": False}
        ).status_code
        == 409
    )
    data(transition(client, auth, edit, "release"))
    data(client.patch(P + "/members/dev", headers=headers(auth, "noor"), json={"active": False}))
    assert client.get(P + "/auth/me", headers=headers(auth)).status_code == 401


def test_refresh_logout_and_role_guards(client, auth):
    assert client.get(P + "/edits").status_code == 401
    for path in ["/board", "/workload", "/audit", "/activity", "/members"]:
        assert client.get(P + path, headers=headers(auth)).status_code == 403
    refreshed = data(
        client.post(P + "/auth/refresh", json={"refresh_token": auth["dev"]["refresh_token"]})
    )
    assert client.get(P + "/auth/me", headers=headers(auth)).status_code == 401
    assert (
        client.post(
            P + "/auth/refresh", json={"refresh_token": auth["dev"]["refresh_token"]}
        ).status_code
        == 401
    )
    h = {"Authorization": "Bearer " + refreshed["access_token"]}
    data(client.post(P + "/auth/logout", headers=h))
    assert client.get(P + "/auth/me", headers=h).status_code == 401
    assert (
        client.post(
            P + "/auth/refresh", json={"refresh_token": refreshed["refresh_token"]}
        ).status_code
        == 401
    )


def test_activity_archive_preferences_export_and_swagger(client, auth):
    edit = admitted(client, auth)[0]
    activity = data(client.get(P + "/activity", headers=headers(auth, "noor")))
    assert activity["total"] == 1 and activity["points"][0]["edits"] == 1
    assert activity["scope"] == "admitted_queue"
    data(
        client.post(
            P + f"/edits/{edit['id']}/archive", headers=headers(auth, "noor"), json={"version": 1}
        )
    )
    assert data(client.get(P + "/edits", headers=headers(auth)))["total"] == 0
    assert data(client.get(P + "/activity", headers=headers(auth, "noor")))["total"] == 1
    pref = data(client.get(P + "/preferences/me", headers=headers(auth, "sara")))
    pref["board_order"].reverse()
    saved = data(client.put(P + "/preferences/me", headers=headers(auth, "sara"), json=pref))
    assert saved["version"] == 2
    assert (
        client.put(P + "/preferences/me", headers=headers(auth, "sara"), json=pref).status_code
        == 409
    )
    assert (
        data(client.get(P + "/preferences/me", headers=headers(auth, "sara")))["board_order"]
        == saved["board_order"]
    )
    export = client.get(P + "/audit/export", headers=headers(auth, "noor"))
    assert export.status_code == 200 and "text/csv" in export.headers["content-type"]
    schema = client.get(P + "/openapi.json").json()
    assert len(schema["paths"]) >= 20
    assert "password_hash" not in str(schema["components"]["schemas"]["MemberResponse"])
    assert client.get(P + "/swagger").status_code == 200
    assert client.get(P + "/health").status_code == 200


def test_restart_preserves_claims_and_tokens(client, auth):
    from fastapi.testclient import TestClient

    from app.main import create_application

    edit = data(transition(client, auth, admitted(client, auth)[0], "claim"))
    assert edit["claimed_at"] is not None
    # A restarted TestClient uses a new event loop. Release asyncpg connections
    # on their original loop before opening that new application instance.
    from app.core.database import engine

    client.portal.call(engine.dispose)
    # A new app instance reloads data from the same database; no browser state.
    with TestClient(create_application()) as restarted:
        persisted = data(restarted.get(P + f"/edits/{edit['id']}", headers=headers(auth)))
        assert persisted["status"] == "claimed"
        assert persisted["owner_id"] == "dev"


def test_cors_validation_and_rate_limits(client):
    response = client.options(
        P + "/edits",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    denied = client.options(
        P + "/edits",
        headers={"Origin": "https://untrusted.example", "Access-Control-Request-Method": "GET"},
    )
    assert denied.status_code == 400
    for _ in range(20):
        assert (
            client.post(
                P + "/auth/login", json={"email": "unknown@example.org", "password": "bad"}
            ).status_code
            == 401
        )
    assert (
        client.post(
            P + "/auth/login", json={"email": "unknown@example.org", "password": "bad"}
        ).status_code
        == 429
    )


def test_thread_delete_is_author_only(client, auth):
    edit = admitted(client, auth)[0]
    thread = data(
        client.post(
            P + f"/edits/{edit['id']}/threads",
            headers=headers(auth),
            json={
                "anchor": {
                    "wiki": "enwiki",
                    "old_rev": 10,
                    "new_rev": 20,
                    "side": "new",
                    "start_line": 1,
                    "end_line": 1,
                },
                "body": "Comment before claiming",
            },
        )
    )
    assert (
        client.request(
            "DELETE",
            P + f"/threads/{thread['id']}",
            headers=headers(auth, "amir"),
            json={"version": 1},
        ).status_code
        == 403
    )
    data(
        client.request(
            "DELETE", P + f"/threads/{thread['id']}", headers=headers(auth), json={"version": 1}
        )
    )
    assert data(client.get(P + f"/edits/{edit['id']}/threads", headers=headers(auth)))["total"] == 0
    assert (
        client.post(
            P + f"/threads/{thread['id']}/comments", headers=headers(auth), json={"body": "reply"}
        ).status_code
        == 404
    )
    directory = data(client.get(P + "/members/directory", headers=headers(auth)))["items"]
    assert all("email" not in member for member in directory)
