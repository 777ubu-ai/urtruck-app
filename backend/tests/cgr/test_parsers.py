"""Тесты парсеров CGR на реальных фикстурах (снято 2026-06-13).

Фикстуры — настоящие SSR-страницы cgr.qoldau.kz. Если CGR сменит вёрстку,
эти тесты упадут → сигнал обновить parsers.py + фикстуры.
"""
from pathlib import Path

import pytest

from cgr.parsers import (
    parse_public_list,
    parse_booking_lookup,
    parse_checkpoint_list,
    count_queue_by_checkpoint,
    normalize_status,
)
from cgr.exceptions import CGRParseError

FIX = Path(__file__).parent / "fixtures"


def _load(name: str) -> str:
    return (FIX / name).read_text(encoding="utf-8")


def test_parse_public_list_real_rows():
    rows = parse_public_list(_load("public_list_p1.html"))
    assert len(rows) >= 10, "должно распарситься ~15 строк реестра"
    r = rows[0]
    assert set(r) == {"checkpoint", "plate", "queue_datetime", "status"}
    assert r["checkpoint"]
    assert r["plate"]
    assert any(ch.isdigit() for ch in r["queue_datetime"])
    assert r["status"]["code"] in {
        "in_queue", "crossed", "revoked", "payment", "not_paid",
        "review_failed", "validating", "called", "unknown",
    }


def test_normalize_status_in_queue_late():
    s = normalize_status("В очереди Опаздывает")
    assert s["code"] == "in_queue"
    assert s["is_late"] is True


def test_normalize_status_crossed():
    assert normalize_status("Пересёк пункт пропуска")["code"] == "crossed"


def test_count_queue_by_checkpoint():
    rows = parse_public_list(_load("public_list_p1.html"))
    counts = count_queue_by_checkpoint(rows)
    assert sum(counts.values()) >= 1
    assert all(isinstance(v, int) and v > 0 for v in counts.values())


def test_booking_lookup_found_by_plate():
    html = _load("public_list_p1.html")
    plate = parse_public_list(html)[0]["plate"]
    res = parse_booking_lookup(html, plate)
    assert res is not None
    assert res["checkpoint"]
    assert res["status"] in {"in_queue", "crossed", "revoked"}


def test_booking_lookup_not_found():
    assert parse_booking_lookup(_load("public_list_p1.html"), "ZZZ000ZZ") is None


def test_booking_lookup_plate_normalization():
    html = _load("public_list_p1.html")
    plate = parse_public_list(html)[0]["plate"]
    spaced = plate.lower()[:3] + " " + plate.lower()[3:]
    assert parse_booking_lookup(html, spaced) is not None


def test_parse_checkpoint_list_real_names():
    cps = parse_checkpoint_list(_load("checkpoint_list.html"))
    names = {c["name"] for c in cps}
    assert len(cps) >= 10
    assert any("Достык" in n for n in names)
    assert any("Бахты" in n for n in names)
    for c in cps:
        assert c["side_kz"] and c["side_neighbor"]


def test_public_list_no_table_raises():
    with pytest.raises(CGRParseError):
        parse_public_list("<html><body>no table here</body></html>")
