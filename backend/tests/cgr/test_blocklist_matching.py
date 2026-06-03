"""Тесты алгоритма матчинга по чёрному списку.

Синтетические данные (без реального CGR). Покрывают:
  - exact match по ИИН (через хэш)
  - exact match по ГРНЗ (через нормализацию)
  - запись pending_review без автобана
  - проверка что запись match создаётся в admin-queue
"""
import os
import sys
import tempfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))


@pytest.fixture
def db_with_blocklist(monkeypatch):
    """Свежая SQLite + заполненный cgr_blocklist."""
    tf = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tf.close()
    monkeypatch.setattr("config.DB_PATH", tf.name)

    from database import cgr_dal
    cgr_dal.init_cgr_schema()

    salt = "test_salt_64chars_" + "x" * 46
    bad_iin = "123456789012"
    bad_iin_hash = cgr_dal.hash_iin(bad_iin, salt)

    cgr_dal.replace_blocklist([
        {
            "iin_hash": bad_iin_hash,
            "grnz_normalized": "X777BB",
            "full_name_normalized": "иванов иван",
            "blocked_at": "2026-01-15",
            "reason": "Нарушение режима",
        },
        {
            "iin_hash": None,
            "grnz_normalized": "Y888CC",
            "full_name_normalized": "петров петр",
            "blocked_at": "2026-02-20",
            "reason": "Просрочка",
        },
    ])

    yield {"db": tf.name, "salt": salt, "bad_iin": bad_iin}

    os.unlink(tf.name)


def test_iin_exact_match(db_with_blocklist, monkeypatch):
    """ИИН из чёрного списка → создаётся pending_review запись."""
    monkeypatch.setenv("CGR_FEATURE_ENABLED", "true")
    monkeypatch.setenv("CGR_IIN_SALT", db_with_blocklist["salt"])
    # Свежий импорт чтобы settings подхватил env
    for m in list(sys.modules):
        if m.startswith("cgr."):
            del sys.modules[m]

    from cgr.blocklist_service import check_user_against_blocklist

    result = check_user_against_blocklist(
        user_id="user-test-1",
        iin=db_with_blocklist["bad_iin"],
    )
    assert result is not None
    assert result["match_type"] == "iin"
    assert result["match_confidence"] == "exact"
    assert result["match_id"] > 0


def test_grnz_exact_match(db_with_blocklist, monkeypatch):
    """ГРНЗ из чёрного списка → создаётся match (даже без ИИН)."""
    monkeypatch.setenv("CGR_FEATURE_ENABLED", "true")
    monkeypatch.setenv("CGR_IIN_SALT", db_with_blocklist["salt"])
    for m in list(sys.modules):
        if m.startswith("cgr."):
            del sys.modules[m]

    from cgr.blocklist_service import check_user_against_blocklist

    # Y 888 CC → нормализуется в Y888CC
    result = check_user_against_blocklist(
        user_id="user-test-2",
        grnz="Y 888 CC",
    )
    assert result is not None
    assert result["match_type"] == "grnz"
    assert result["match_confidence"] == "exact"


def test_no_match_returns_none(db_with_blocklist, monkeypatch):
    monkeypatch.setenv("CGR_FEATURE_ENABLED", "true")
    monkeypatch.setenv("CGR_IIN_SALT", db_with_blocklist["salt"])
    for m in list(sys.modules):
        if m.startswith("cgr."):
            del sys.modules[m]

    from cgr.blocklist_service import check_user_against_blocklist

    result = check_user_against_blocklist(
        user_id="user-clean",
        iin="999999999999",
        grnz="Z123XYZ",
    )
    assert result is None


def test_no_autoban_status_is_pending_review(db_with_blocklist, monkeypatch):
    """КРИТИЧНО: при совпадении статус ВСЕГДА 'pending_review', не 'confirmed_block'."""
    import sqlite3

    monkeypatch.setenv("CGR_FEATURE_ENABLED", "true")
    monkeypatch.setenv("CGR_IIN_SALT", db_with_blocklist["salt"])
    for m in list(sys.modules):
        if m.startswith("cgr."):
            del sys.modules[m]

    from cgr.blocklist_service import check_user_against_blocklist

    check_user_against_blocklist(user_id="autoban-test", iin=db_with_blocklist["bad_iin"])

    with sqlite3.connect(db_with_blocklist["db"]) as c:
        rows = c.execute(
            "SELECT moderation_status FROM cgr_blocklist_matches WHERE urtruck_user_id = ?",
            ("autoban-test",)
        ).fetchall()
    assert len(rows) == 1
    assert rows[0][0] == "pending_review", "Автобан запрещён — должен быть pending_review!"
