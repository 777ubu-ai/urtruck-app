"""Focused regression tests for entity-specific notification read state."""
from database import db as ddb

ddb.init_db()

from api.notifications import create_notification, mark_notifications_read_by_urls
from database.db import get_conn

USER_A = "notif-user-a"
USER_B = "notif-user-b"


def _reset():
    with get_conn() as c:
        c.execute("DELETE FROM notifications")


def _add(user, url):
    create_notification(user, "test", "test", url=url)


def _rows(user):
    with get_conn() as c:
        return [dict(r) for r in c.execute(
            "SELECT url, is_read FROM notifications WHERE user_id = ? ORDER BY id", (user,)
        ).fetchall()]


def test_01_exact_relative_path_matches():
    _reset(); _add(USER_A, "/cargos/abc")
    assert mark_notifications_read_by_urls(USER_A, ["/cargos/abc"]) == 1
    assert _rows(USER_A)[0]["is_read"] == 1


def test_02_query_string_matches_same_path():
    _reset(); _add(USER_A, "/cargos/abc?bid=42")
    assert mark_notifications_read_by_urls(USER_A, ["/cargos/abc"]) == 1


def test_03_fragment_matches_same_path():
    _reset(); _add(USER_A, "/trips/t1#offers")
    assert mark_notifications_read_by_urls(USER_A, ["/trips/t1"]) == 1


def test_04_absolute_url_matches_relative_target():
    _reset(); _add(USER_A, "https://app.urtruck.kz/deals/d1?tab=chat")
    assert mark_notifications_read_by_urls(USER_A, ["/deals/d1"]) == 1


def test_05_trailing_slash_is_normalized():
    _reset(); _add(USER_A, "/cargos/abc/")
    assert mark_notifications_read_by_urls(USER_A, ["/cargos/abc"]) == 1


def test_06_similar_identifier_does_not_match():
    _reset(); _add(USER_A, "/cargos/abc2")
    assert mark_notifications_read_by_urls(USER_A, ["/cargos/abc"]) == 0
    assert _rows(USER_A)[0]["is_read"] == 0


def test_07_other_entity_does_not_match():
    _reset(); _add(USER_A, "/trips/abc")
    assert mark_notifications_read_by_urls(USER_A, ["/cargos/abc"]) == 0


def test_08_other_user_is_isolated():
    _reset(); _add(USER_A, "/cargos/abc"); _add(USER_B, "/cargos/abc")
    assert mark_notifications_read_by_urls(USER_A, ["/cargos/abc"]) == 1
    assert _rows(USER_A)[0]["is_read"] == 1
    assert _rows(USER_B)[0]["is_read"] == 0


def test_09_duplicate_targets_are_idempotent():
    _reset(); _add(USER_A, "/cargos/abc?bid=1")
    assert mark_notifications_read_by_urls(USER_A, ["/cargos/abc", "/cargos/abc"]) == 1
    assert mark_notifications_read_by_urls(USER_A, ["/cargos/abc"]) == 0


def test_10_multiple_entity_paths_mark_only_selected_rows():
    _reset()
    _add(USER_A, "/cargos/c1?bid=1")
    _add(USER_A, "/trips/t1?bid=2")
    _add(USER_A, "/deals/d1")
    assert mark_notifications_read_by_urls(USER_A, ["/cargos/c1", "/deals/d1"]) == 2
    state = {r["url"]: r["is_read"] for r in _rows(USER_A)}
    assert state["/cargos/c1?bid=1"] == 1
    assert state["/deals/d1"] == 1
    assert state["/trips/t1?bid=2"] == 0
