"""Regression tests for server-side QA fixture isolation."""

from api import marketplace


def test_qa_marker_is_hidden_from_production_public_feed(monkeypatch):
    row = {
        "cargo_desc": "Партия [ar-run-123]",
        "from_city": "Хоргос",
        "to_city": "Алматы",
        "cargo_type": "tent",
        "pickup_date": "2099-01-01",
        "created_at": "2098-12-01 00:00:00",
    }
    monkeypatch.setattr(marketplace, "IS_PRODUCTION", True)
    assert marketplace._public_cargo_ok(row) is False


def test_qa_marker_is_available_only_in_non_production_qa_environment(monkeypatch):
    row = {
        "cargo_desc": "Партия [ar-run-123]",
        "from_city": "Хоргос",
        "to_city": "Алматы",
        "cargo_type": "tent",
        "pickup_date": "2099-01-01",
        "created_at": "2098-12-01 00:00:00",
    }
    monkeypatch.setattr(marketplace, "IS_PRODUCTION", False)
    assert marketplace._public_cargo_ok(row) is True
