"""Избранное (driver + cargo) — контракт-тест.

Регресс на баг с прод-скриншотов (2026-08-18): «Избранное» показывало
только item_type='driver' — грузы, сохранённые водителем (item_type=
'cargo'), реально писались в БД, но никогда не запрашивались фронтом
(FavoritesScreen.favList('driver')) → выглядело как «сохраняю, а там
пусто». Здесь проверяем backend-контракт, на который опирается фикс:
favList('') отдаёт ОБА типа одним запросом, без дублей, без падения на
несуществующем item_id (favorites — снэпшот, без live-join).

Run from backend/:
    DB_PATH=/tmp/urtruck_test_favorites.db python -m tests.test_favorites_contract
Совместим с pytest.
"""
import os
import sys
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_favorites.db")
Path(TEST_DB).unlink(missing_ok=True)
os.environ.setdefault("URTRUCK_ENV", "test")

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from fastapi import FastAPI
from fastapi.testclient import TestClient
from database import db as ddb
from database import registration_dal as reg_dal

ddb.init_db()
reg_dal.init_registration_schema()

from api.favorites import fav_router
from api.admin import admin_router, KNOWN_TEST_ACCOUNT_IDS_2026_08_19

app = FastAPI()
app.include_router(fav_router, prefix="/api/v1/favorites")
app.include_router(admin_router, prefix="/admin")
client = TestClient(app)


def _new_user_token():
    guest = reg_dal.create_guest()
    uid = guest["id"] if isinstance(guest, dict) else guest
    token = reg_dal.create_session(uid)
    return uid, token


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_mixed_list_returns_both_types_one_request():
    """favList('') — один запрос, оба типа, без потерь. Сама первопричина
    прод-бага: экран раньше не делал этот запрос вовсе для cargo."""
    _, tok = _new_user_token()
    r = client.post("/api/v1/favorites", json={"item_type": "driver", "item_id": "drv_1", "item_data": {"name": "Тест Водитель"}}, headers=_auth(tok))
    assert r.status_code == 200 and r.json()["ok"] is True
    r = client.post("/api/v1/favorites", json={"item_type": "cargo", "item_id": "cg_1", "item_data": {"from": "Алматы", "to": "Астана"}}, headers=_auth(tok))
    assert r.status_code == 200 and r.json()["ok"] is True

    r = client.get("/api/v1/favorites", headers=_auth(tok))
    favs = r.json()["favorites"]
    types = sorted(f["item_type"] for f in favs)
    assert types == ["cargo", "driver"], f"expected both types in one request, got {types}"


def test_filtered_list_still_works_per_type():
    _, tok = _new_user_token()
    client.post("/api/v1/favorites", json={"item_type": "driver", "item_id": "drv_2"}, headers=_auth(tok))
    client.post("/api/v1/favorites", json={"item_type": "cargo", "item_id": "cg_2"}, headers=_auth(tok))

    r = client.get("/api/v1/favorites?item_type=driver", headers=_auth(tok))
    favs = r.json()["favorites"]
    assert all(f["item_type"] == "driver" for f in favs)
    assert any(f["item_id"] == "drv_2" for f in favs)
    assert not any(f["item_id"] == "cg_2" for f in favs)


def test_double_add_is_idempotent_no_duplicate_row():
    """Двойной тап (двойной POST) не создаёт вторую запись — DB UNIQUE
    (user_id, item_type, item_id) + INSERT OR IGNORE."""
    _, tok = _new_user_token()
    for _ in range(3):
        r = client.post("/api/v1/favorites", json={"item_type": "driver", "item_id": "drv_dup"}, headers=_auth(tok))
        assert r.status_code == 200

    r = client.get("/api/v1/favorites?item_type=driver", headers=_auth(tok))
    matching = [f for f in r.json()["favorites"] if f["item_id"] == "drv_dup"]
    assert len(matching) == 1, f"expected exactly 1 row after 3x add, got {len(matching)}"


def test_remove_then_readd_works():
    _, tok = _new_user_token()
    client.post("/api/v1/favorites", json={"item_type": "cargo", "item_id": "cg_readd"}, headers=_auth(tok))
    r = client.delete("/api/v1/favorites?item_type=cargo&item_id=cg_readd", headers=_auth(tok))
    assert r.status_code == 200 and r.json()["ok"] is True

    r = client.get("/api/v1/favorites?item_type=cargo", headers=_auth(tok))
    assert not any(f["item_id"] == "cg_readd" for f in r.json()["favorites"])

    # повторное удаление уже отсутствующей записи не должно падать (идемпотентно)
    r = client.delete("/api/v1/favorites?item_type=cargo&item_id=cg_readd", headers=_auth(tok))
    assert r.status_code == 200

    # повторное сохранение после удаления снова работает
    r = client.post("/api/v1/favorites", json={"item_type": "cargo", "item_id": "cg_readd"}, headers=_auth(tok))
    assert r.status_code == 200
    r = client.get("/api/v1/favorites?item_type=cargo", headers=_auth(tok))
    assert any(f["item_id"] == "cg_readd" for f in r.json()["favorites"])


def test_orphaned_item_id_does_not_break_list():
    """favorites — снэпшот (item_data), без live-join на drivers_registration/
    cargos. Несуществующий (удалённый) item_id не должен ронять список."""
    _, tok = _new_user_token()
    r = client.post(
        "/api/v1/favorites",
        json={"item_type": "driver", "item_id": "drv_does_not_exist_anywhere", "item_data": {"name": "Удалённый водитель"}},
        headers=_auth(tok),
    )
    assert r.status_code == 200

    r = client.get("/api/v1/favorites", headers=_auth(tok))
    assert r.status_code == 200
    assert any(f["item_id"] == "drv_does_not_exist_anywhere" for f in r.json()["favorites"])


def test_favorites_scoped_per_user():
    """Список избранного одного пользователя не содержит чужих записей."""
    _, tok_a = _new_user_token()
    _, tok_b = _new_user_token()
    client.post("/api/v1/favorites", json={"item_type": "driver", "item_id": "drv_a_only"}, headers=_auth(tok_a))

    r = client.get("/api/v1/favorites", headers=_auth(tok_b))
    assert not any(f["item_id"] == "drv_a_only" for f in r.json()["favorites"])


def test_no_token_rejected():
    r = client.get("/api/v1/favorites")
    assert r.status_code in (401, 403)


def _admin_auth():
    import base64
    user = os.getenv("URTRUCK_ADMIN_USER", "admin")
    pw = os.getenv("URTRUCK_ADMIN_PASS", "urtruck-admin-2026")
    token = base64.b64encode(f"{user}:{pw}".encode()).decode()
    return {"Authorization": f"Basic {token}"}


def test_cleanup_known_test_favorites_dry_run_default_does_not_delete():
    """Root-cause fix (2026-08-19): одноразовая чистка избранного по 3
    подтверждённым owner'ом (2026-07-30) внутренним тест-аккаунтам.
    dry_run=true по умолчанию — ничего не удаляет."""
    _, tok = _new_user_token()
    test_id = KNOWN_TEST_ACCOUNT_IDS_2026_08_19[0]
    client.post("/api/v1/favorites", json={"item_type": "driver", "item_id": test_id, "item_data": {"name": "Cvbbb Zcvvvb"}}, headers=_auth(tok))

    r = client.post("/admin/cleanup-known-test-favorites-2026-08-19", headers=_admin_auth())
    assert r.status_code == 200
    body = r.json()
    assert body["dry_run"] is True
    assert body["favorites_deleted"] == 0
    assert body["favorites_would_delete"] >= 1

    # запись всё ещё на месте после dry-run
    r = client.get("/api/v1/favorites?item_type=driver", headers=_auth(tok))
    assert any(f["item_id"] == test_id for f in r.json()["favorites"])


def test_cleanup_known_test_favorites_real_run_scoped_only():
    """dry_run=false реально удаляет ТОЛЬКО 3 известных ID — легитимная
    запись обычного пользователя не трогается (жёсткий скоуп, не общая
    чистка избранного)."""
    _, tok = _new_user_token()
    test_id = KNOWN_TEST_ACCOUNT_IDS_2026_08_19[1]
    real_id = "drv_real_user_untouched"
    client.post("/api/v1/favorites", json={"item_type": "driver", "item_id": test_id}, headers=_auth(tok))
    client.post("/api/v1/favorites", json={"item_type": "driver", "item_id": real_id}, headers=_auth(tok))

    r = client.post("/admin/cleanup-known-test-favorites-2026-08-19?dry_run=false", headers=_admin_auth())
    assert r.status_code == 200
    assert r.json()["dry_run"] is False
    assert r.json()["favorites_deleted"] >= 1

    r = client.get("/api/v1/favorites?item_type=driver", headers=_auth(tok))
    remaining = [f["item_id"] for f in r.json()["favorites"]]
    assert test_id not in remaining, "known test account favorite must be gone"
    assert real_id in remaining, "unrelated real favorite must NOT be touched (scoped cleanup)"


if __name__ == "__main__":
    import traceback
    tests = [v for k, v in list(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for fn in tests:
        try:
            fn()
            print(f"  ok: {fn.__name__}")
        except Exception:
            failed += 1
            print(f"FAIL: {fn.__name__}")
            traceback.print_exc()
    print(f"\n{'All passed' if not failed else str(failed) + ' FAILED'} ({len(tests)} tests)")
    sys.exit(1 if failed else 0)
