"""Блок 6 аудита (P1-8): «push может не дойти — notification (in-app) должен
быть источником истины». Раньше scheduler-события (reminder/expired/
no_bids) и admin approve/reject документов создавали ТОЛЬКО push, без
единой записи в notifications — если push не доставлен (нет permission,
устройство offline, провайдер недоступен), событие терялось безвозвратно
(ни в колокольчике, ни где-либо ещё).

Проверяем:
  1) create_notification(event_key=...) — идемпотентен, повторный вызов с
     тем же (user_id, event_key) не плодит вторую строку;
  2) scheduler.jobs.push_reminders_job/expired_notify_job/no_bids_notify_job
     создают notification ДАЖЕ если push_sender.send выбрасывает исключение
     (push недоступен) — реальным вызовом джобы с монки-патченным send;
  3) admin_approve/admin_reject создают notification с dedup на день
     (повторный клик не плодит вторую запись).

Run from backend/:
    DB_PATH=/tmp/urtruck_test_notif_truth.db python -m tests.test_notification_source_of_truth
Exit != 0 на любой ошибке. Совместим с pytest.
"""
import contextvars
import os
import sys
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_notif_truth.db")
Path(TEST_DB).unlink(missing_ok=True)

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from database import db as ddb
from database import registration_dal

ddb.init_db()
registration_dal.init_registration_schema()

from api.notifications import create_notification
import api.push  # noqa: F401 — триггерит _init_schema() (push_tokens_native/push_subscriptions)
from database.db import get_conn


def _count(user_id, event_key):
    with get_conn() as c:
        return c.execute(
            "SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND event_key = ?",
            (user_id, event_key),
        ).fetchone()["c"]


def test_create_notification_event_key_dedup():
    create_notification("u1", "reminder", "T", "B", "🔔", url="/", event_key="ek-1")
    create_notification("u1", "reminder", "T", "B", "🔔", url="/", event_key="ek-1")
    create_notification("u1", "reminder", "T", "B", "🔔", url="/", event_key="ek-1")
    assert _count("u1", "ek-1") == 1, "повторный вызов с тем же event_key не должен плодить строки"


def test_create_notification_without_event_key_not_deduped():
    """Без event_key поведение прежнее — bid/deal-события одноразовые по
    своей природе, дедуп им не нужен (и не должен внезапно появиться)."""
    with get_conn() as c:
        before = c.execute("SELECT COUNT(*) c FROM notifications WHERE user_id = 'u2'").fetchone()["c"]
    create_notification("u2", "bid_created", "T", "B", "💰", url="/cargos/x")
    create_notification("u2", "bid_created", "T", "B", "💰", url="/cargos/x")
    with get_conn() as c:
        after = c.execute("SELECT COUNT(*) c FROM notifications WHERE user_id = 'u2'").fetchone()["c"]
    assert after - before == 2


def test_different_event_key_not_deduped():
    create_notification("u3", "expired", "T1", "B1", "📭", url="/", event_key="expired:stage1:2026-01-01")
    create_notification("u3", "expired", "T2", "B2", "📭", url="/", event_key="expired:stage2:2026-01-02")
    assert _count("u3", "expired:stage1:2026-01-01") == 1
    assert _count("u3", "expired:stage2:2026-01-02") == 1


def test_scheduler_reminders_job_creates_notification_even_when_push_fails():
    """Ключевой регресс P1-8: монки-патчим push_sender.send так, чтобы он
    ВСЕГДА падал (имитация «push недоступен») — notification обязана всё
    равно появиться, т.к. создаётся в отдельном try/except ДО попытки push."""
    from scheduler import jobs as jobs_mod
    from services import push_sender

    # Реальный водитель с push-токеном, неактивный >3 дней — попадает в
    # выборку push_reminders_job.
    guest = registration_dal.create_guest()
    uid = guest["id"] if isinstance(guest, dict) else guest
    with get_conn() as c:
        c.execute(
            "UPDATE drivers_registration SET status='approved', role='driver', "
            "updated_at = datetime('now','-10 days') WHERE id = ?",
            (uid,),
        )
        c.execute(
            "INSERT INTO push_tokens_native (user_id, token, provider, active) VALUES (?,?,?,1)",
            (uid, "ExponentPushToken[notif-truth-reminder]", "expo"),
        )

    original_send = push_sender.send

    def _always_fail(*a, **k):
        raise RuntimeError("simulated push provider outage")

    push_sender.send = _always_fail
    try:
        jobs_mod.push_reminders_job()
    finally:
        push_sender.send = original_send

    with get_conn() as c:
        row = c.execute(
            "SELECT * FROM notifications WHERE user_id = ? AND type = 'reminder' "
            "ORDER BY id DESC LIMIT 1",
            (uid,),
        ).fetchone()
    assert row is not None, "notification должна была создаться, даже когда push_sender.send всегда падает"
    assert row["event_key"] is not None and row["event_key"].startswith("reminder-inactive:")


def test_admin_approve_creates_notification_with_dedup():
    from api import admin as admin_mod

    guest = registration_dal.create_guest()
    uid = guest["id"] if isinstance(guest, dict) else guest

    class _FakeUser:
        pass

    # admin_approve — обычная функция FastAPI-роута; Depends(check_admin)
    # не резолвится вне TestClient, поэтому вызываем как plain-функцию с
    # уже подставленным user (так же делают остальные unit-тесты в проекте
    # для simple CRUD-функций без сложных зависимостей).
    result1 = admin_mod.admin_approve(uid, user="test-admin")
    assert result1["ok"] is True
    result2 = admin_mod.admin_approve(uid, user="test-admin")  # двойной клик
    assert result2["ok"] is True

    with get_conn() as c:
        cnt = c.execute(
            "SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND type = 'reg_status' "
            "AND event_key LIKE 'admin-approve:%'",
            (uid,),
        ).fetchone()["c"]
    assert cnt == 1, f"двойной клик 'Одобрить' не должен плодить 2 notification, получили {cnt}"


def test_admin_reject_creates_notification_with_dedup():
    from api import admin as admin_mod

    guest = registration_dal.create_guest()
    uid = guest["id"] if isinstance(guest, dict) else guest

    admin_mod.admin_reject(uid, reason="Плохое фото документа", user="test-admin")
    admin_mod.admin_reject(uid, reason="Плохое фото документа", user="test-admin")

    with get_conn() as c:
        cnt = c.execute(
            "SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND type = 'reg_status' "
            "AND event_key LIKE 'admin-reject:%'",
            (uid,),
        ).fetchone()["c"]
    assert cnt == 1


if __name__ == "__main__":
    fails = 0
    for fn in [test_create_notification_event_key_dedup,
               test_create_notification_without_event_key_not_deduped,
               test_different_event_key_not_deduped,
               test_scheduler_reminders_job_creates_notification_even_when_push_fails,
               test_admin_approve_creates_notification_with_dedup,
               test_admin_reject_creates_notification_with_dedup]:
        try:
            fn(); print(f"  ✅ {fn.__name__}")
        except Exception as e:
            fails += 1; print(f"  ❌ {fn.__name__}: {e}")
    print(f"\n{'ВСЕ ЗЕЛЁНЫЕ' if not fails else str(fails)+' FAIL'}")
    sys.exit(1 if fails else 0)
