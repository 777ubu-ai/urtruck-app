"""CGR public surface: truthful disabled/stale state, masking and limits."""
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api import borders
from cgr import booking_service, scoreboard_service
from cgr.settings import cgr_settings
from database import cgr_dal
from database.db import get_conn


app = FastAPI()
app.include_router(borders.borders_router, prefix="/api/v1/borders")
client = TestClient(app)


def test_disabled_scoreboard_and_board_are_200_without_mock(monkeypatch):
    monkeypatch.setattr(cgr_settings, "feature_enabled", False)
    monkeypatch.setattr(
        cgr_dal, "consume_public_rate_limit",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("disabled route must not touch limiter")),
    )
    scoreboard = client.get("/api/v1/borders/scoreboard")
    board = client.get("/api/v1/borders/board")
    assert scoreboard.status_code == board.status_code == 200
    assert scoreboard.json()["enabled"] is False
    assert scoreboard.json()["checkpoints"] == []
    assert scoreboard.json()["source_status"] == "disabled"
    assert scoreboard.json()["source_updated_at"] is None
    assert board.json()["enabled"] is False
    assert board.json()["rows"] == []


def test_scoreboard_fetched_at_is_source_time_not_response_time(monkeypatch):
    monkeypatch.setattr(cgr_settings, "feature_enabled", True)
    cgr_dal.upsert_checkpoint("Privacy checkpoint", country_to="CN", code="privacy_cp")
    cgr_dal.insert_scoreboard_entry("privacy_cp", "IN", 7, None)
    payload = client.get("/api/v1/borders/scoreboard").json()
    assert payload["source_type"] == "official"
    assert payload["generated_at"]
    assert payload["source_updated_at"]
    assert payload["fetched_at"] == payload["source_updated_at"]
    assert payload["generated_at"] != payload["source_updated_at"]


def test_stale_checkpoint_keeps_real_old_source_timestamp(monkeypatch):
    monkeypatch.setattr(cgr_settings, "feature_enabled", True)
    cgr_dal.upsert_checkpoint("Stale privacy checkpoint", country_to="RU", code="privacy_stale")
    cgr_dal.insert_scoreboard_entry("privacy_stale", "IN", 3, None)
    with get_conn() as conn:
        conn.execute(
            "UPDATE cgr_scoreboard SET fetched_at='2000-01-01 00:00:00' "
            "WHERE checkpoint_code='privacy_stale'"
        )
    payload = client.get("/api/v1/borders/scoreboard").json()
    row = next(item for item in payload["checkpoints"] if item["code"] == "privacy_stale")
    assert row["status"] == "stale"
    assert row["last_updated"].startswith("2000-01-01")
    assert row["directions"]["in"]["queue_length"] is None
    assert row["directions"]["in"]["last_known_queue_length"] == 3


def test_public_board_masks_plate_and_drops_raw_status(monkeypatch):
    monkeypatch.setattr(cgr_settings, "feature_enabled", True)
    borders._BOARD_CACHE.clear()

    async def fake_rows(**_kwargs):
        return [{
            "checkpoint": "Нур Жолы", "plate": "A123BC02",
            "queue_datetime": "2026-08-15T10:00:00Z",
            "status": {"code": "in_queue", "is_late": False, "raw": "Полный сырой статус"},
        }]

    monkeypatch.setattr(scoreboard_service, "fetch_board_rows", fake_rows)
    payload = client.get("/api/v1/borders/board").json()
    assert payload["rows"][0]["plate"] == "***02"
    assert "A123BC02" not in str(payload)
    assert "status_raw" not in payload["rows"][0]
    assert payload["source_status"] == "live"
    assert payload["source_updated_at"] is None
    assert payload["source_fetched_at"]
    assert payload["generated_at"]


def test_lookup_masks_echo_and_drops_upstream_raw_copy(monkeypatch):
    monkeypatch.setattr(cgr_settings, "feature_enabled", True)

    async def fake_lookup(_plate):
        return {"found": True, "plate": "A123BC02", "status": "in_queue", "status_raw": "В очереди"}

    monkeypatch.setattr(booking_service, "lookup_by_plate", fake_lookup)
    payload = client.get("/api/v1/borders/lookup", params={"plate": "A123BC02"}).json()
    assert payload["plate"] == "***02"
    assert "A123BC02" not in str(payload)
    assert "status_raw" not in payload
    assert payload["source_type"] == "official"
    assert payload["source_updated_at"] is None
    assert payload["source_fetched_at"]


def test_public_rate_limit_denies_before_upstream_fetch(monkeypatch):
    monkeypatch.setattr(cgr_settings, "feature_enabled", True)
    monkeypatch.setattr(cgr_dal, "consume_public_rate_limit", lambda *_args, **_kwargs: False)
    response = client.get("/api/v1/borders/board")
    assert response.status_code == 429
    assert response.headers["retry-after"] == "60"


def test_plate_mask_never_returns_full_identifier():
    assert borders._mask_plate("A123BC02") == "***02"
    assert borders._mask_plate(" 01 A 777 AA ") == "***AA"
    assert borders._mask_plate("") is None
