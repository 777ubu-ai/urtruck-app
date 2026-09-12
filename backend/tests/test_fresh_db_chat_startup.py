"""Новая БД должна запускать chat после registration-таблиц.

Это повторяет local/CI E2E runtime: router импортируется до FastAPI startup,
когда SQLite-файл ещё не получил базовую схему.
"""
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_fresh_database_starts_with_chat_router(tmp_path):
    db_path = tmp_path / "fresh-e2e.db"
    code = """
from fastapi.testclient import TestClient
import main
with TestClient(main.app) as client:
    assert client.get('/api/v1/system/info').status_code == 200
    assert client.get('/api/v1/borders/catalog').status_code == 200
    with main.db.get_conn() as conn:
        assert conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'border_checkpoints'"
        ).fetchone()
"""
    env = {
        **os.environ,
        "ENV": "development",
        "URTRUCK_ENV": "development",
        "BETA_MODE": "true",
        "DB_PATH": str(db_path),
        "SENTRY_DSN": "",
        "TELEGRAM_BOT_TOKEN": "",
    }
    completed = subprocess.run(
        [sys.executable, "-c", code],
        cwd=ROOT,
        env=env,
        text=True,
        capture_output=True,
        timeout=30,
    )
    assert completed.returncode == 0, completed.stderr + completed.stdout
