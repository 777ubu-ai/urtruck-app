"""P0-8 + P0-10 (08.08.2026):
  * start_scheduler() должен быть идемпотентным синглтоном (повторный вызов
    не плодит второй BackgroundScheduler) и отключаемым через
    URTRUCK_ENABLE_SCHEDULER=0;
  * run_backup() должен создавать ВЕРИФИЦИРУЕМЫЙ снимок: backup → restore →
    открывается → PRAGMA quick_check = ok, плюс .sha256 рядом.

Run from backend/:
    DB_PATH=/tmp/urtruck_test_sched.db python -m tests.test_scheduler_and_backup
"""
import os
import sqlite3
import sys
import tempfile
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_sched.db")
Path(TEST_DB).unlink(missing_ok=True)

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


def test_scheduler_disabled_returns_none():
    os.environ["URTRUCK_ENABLE_SCHEDULER"] = "0"
    import importlib
    from scheduler import jobs
    importlib.reload(jobs)
    assert jobs.start_scheduler() is None
    os.environ.pop("URTRUCK_ENABLE_SCHEDULER", None)


def test_scheduler_singleton_idempotent():
    os.environ.pop("URTRUCK_ENABLE_SCHEDULER", None)
    os.environ["URTRUCK_SCHEDULER_LOCK"] = tempfile.mktemp(suffix=".lock")
    import importlib
    from scheduler import jobs
    importlib.reload(jobs)
    s1 = jobs.start_scheduler()
    try:
        assert s1 is not None, "первый start должен подняться"
        s2 = jobs.start_scheduler()
        assert s2 is s1, "повторный start должен вернуть тот же scheduler (без второго процесса джоб)"
        # все 6 джоб зарегистрированы ровно один раз
        ids = sorted(j.id for j in s1.get_jobs())
        assert ids == sorted(["telegram_parse", "monthly_rescore", "db_backup",
                              "push_reminders", "expired_notify", "no_bids_notify"]), ids
    finally:
        jobs.stop_scheduler()
        os.environ.pop("URTRUCK_SCHEDULER_LOCK", None)


def test_second_process_lock_blocks_duplicate():
    """Если lock уже удерживается (эмулируем «другой процесс»), start
    возвращает None — джобы не дублируются при N воркерах."""
    import fcntl
    lock_path = tempfile.mktemp(suffix=".lock")
    holder = open(lock_path, "w")
    fcntl.flock(holder.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    os.environ["URTRUCK_SCHEDULER_LOCK"] = lock_path
    os.environ.pop("URTRUCK_ENABLE_SCHEDULER", None)
    import importlib
    from scheduler import jobs
    importlib.reload(jobs)
    try:
        assert jobs.start_scheduler() is None, "при удержанном lock start должен быть no-op"
    finally:
        fcntl.flock(holder.fileno(), fcntl.LOCK_UN)
        holder.close()
        os.environ.pop("URTRUCK_SCHEDULER_LOCK", None)


def test_backup_produces_restorable_verified_snapshot():
    """backup → restore → открывается → quick_check ok, + .sha256 совпадает."""
    from scheduler import backup_job
    # Готовим источник с данными
    src = Path(tempfile.mktemp(suffix=".db"))
    con = sqlite3.connect(str(src))
    con.execute("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)")
    con.executemany("INSERT INTO t (v) VALUES (?)", [("a",), ("b",), ("c",)])
    con.commit(); con.close()

    dst_dir = Path(tempfile.mkdtemp())
    # временно перенаправляем config.DB_PATH и BACKUP_DIR
    import config
    old_db, old_dir = config.DB_PATH, backup_job.BACKUP_DIR
    config.DB_PATH = str(src)
    backup_job.BACKUP_DIR = dst_dir
    try:
        out = backup_job.run_backup()
        assert out is not None, "run_backup вернул None (снимок не создан/не прошёл quick_check)"
        snap = Path(out)
        assert snap.exists()
        # restore smoke: открыть копию и проверить целостность + данные
        rcon = sqlite3.connect(str(snap))
        ok = rcon.execute("PRAGMA quick_check").fetchone()[0]
        n = rcon.execute("SELECT COUNT(*) FROM t").fetchone()[0]
        rcon.close()
        assert ok == "ok", f"восстановленная БД не прошла quick_check: {ok}"
        assert n == 3, f"данные не восстановились полностью: {n}"
        # sha256 рядом и совпадает
        import hashlib
        sha_file = dst_dir / f"{snap.name}.sha256"
        assert sha_file.exists(), "нет .sha256 рядом со снимком"
        h = hashlib.sha256(snap.read_bytes()).hexdigest()
        assert h in sha_file.read_text(), "sha256 не совпадает с содержимым снимка"
    finally:
        config.DB_PATH, backup_job.BACKUP_DIR = old_db, old_dir


if __name__ == "__main__":
    fails = 0
    for fn in [test_scheduler_disabled_returns_none,
               test_scheduler_singleton_idempotent,
               test_second_process_lock_blocks_duplicate,
               test_backup_produces_restorable_verified_snapshot]:
        try:
            fn(); print(f"  ✅ {fn.__name__}")
        except Exception as e:
            fails += 1; print(f"  ❌ {fn.__name__}: {e}")
    print(f"\n{'ВСЕ ЗЕЛЁНЫЕ' if not fails else str(fails)+' FAIL'}")
    sys.exit(1 if fails else 0)
