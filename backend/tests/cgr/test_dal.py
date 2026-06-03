"""Тесты DAL: hash, normalize, init_cgr_schema, seed."""
import os
import sqlite3
import sys
import tempfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))


@pytest.fixture
def temp_db(monkeypatch):
    """Свежая SQLite в tmp на каждый тест."""
    tf = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tf.close()
    monkeypatch.setattr("config.DB_PATH", tf.name)
    yield tf.name
    os.unlink(tf.name)


def test_hash_iin_is_64_hex():
    from database import cgr_dal
    h = cgr_dal.hash_iin("123456789012", "salt_value_x" * 4)
    assert len(h) == 64
    assert all(c in "0123456789abcdef" for c in h)


def test_hash_iin_is_deterministic():
    from database import cgr_dal
    h1 = cgr_dal.hash_iin("123456789012", "salt_value")
    h2 = cgr_dal.hash_iin("123456789012", "salt_value")
    assert h1 == h2


def test_hash_iin_different_salt_different_hash():
    from database import cgr_dal
    h1 = cgr_dal.hash_iin("123456789012", "salt_A")
    h2 = cgr_dal.hash_iin("123456789012", "salt_B")
    assert h1 != h2


def test_hash_iin_requires_both_args():
    from database import cgr_dal
    with pytest.raises(ValueError):
        cgr_dal.hash_iin("", "salt")
    with pytest.raises(ValueError):
        cgr_dal.hash_iin("123", "")


def test_normalize_grnz_strips_spaces_and_dashes():
    from database import cgr_dal
    assert cgr_dal.normalize_grnz("a 123 bc") == "A123BC"
    assert cgr_dal.normalize_grnz("a-123-bc") == "A123BC"
    assert cgr_dal.normalize_grnz("A123BC") == "A123BC"


def test_parse_legacy_countries():
    from database.cgr_dal import _parse_legacy_countries
    assert _parse_legacy_countries("KZ↔CN") == ("KZ", "CN")
    assert _parse_legacy_countries("KZ-CN") == ("KZ", "CN")
    assert _parse_legacy_countries("CN") == ("KZ", "CN")


def test_init_cgr_schema_creates_all_tables(temp_db):
    from database import cgr_dal
    cgr_dal.init_cgr_schema()
    with sqlite3.connect(temp_db) as c:
        tables = {
            r[0] for r in c.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
    expected = {
        "border_checkpoints",
        "cgr_scoreboard",
        "cgr_booking_status",
        "cgr_booking_poll_log",
        "cgr_blocklist",
        "cgr_blocklist_matches",
        "cgr_push_throttle",
    }
    assert expected.issubset(tables), f"Missing: {expected - tables}"


def test_seed_idempotent(temp_db):
    """Повторный seed не дублирует записи."""
    from database import cgr_dal
    cgr_dal.init_cgr_schema()
    n1 = cgr_dal.seed_border_checkpoints_from_legacy()
    n2 = cgr_dal.seed_border_checkpoints_from_legacy()
    assert n1 >= 8, f"Expected at least 8 border checkpoints from legacy, got {n1}"
    assert n2 == 0, "Second seed must be no-op"


def test_seed_creates_expected_checkpoints(temp_db):
    from database import cgr_dal
    cgr_dal.init_cgr_schema()
    cgr_dal.seed_border_checkpoints_from_legacy()
    cps = cgr_dal.get_all_checkpoints()
    codes = {c["code"] for c in cps}
    expected = {"khorgos", "dostyk", "kolzhat", "bakhty",
                "sagarchin", "zhaysan", "zhibek", "korday"}
    assert expected.issubset(codes), f"Missing checkpoints: {expected - codes}"


def test_should_send_push_throttle(temp_db):
    from database import cgr_dal
    cgr_dal.init_cgr_schema()
    cgr_dal.seed_border_checkpoints_from_legacy()
    bid = cgr_dal.create_booking("user1", None, "TEST-123", "khorgos")

    assert cgr_dal.should_send_push(bid, "queue_changed") is True
    cgr_dal.log_push_sent(bid, "queue_changed")
    assert cgr_dal.should_send_push(bid, "queue_changed") is False  # throttled
    # Другой kind — не throttled
    assert cgr_dal.should_send_push(bid, "activated") is True
