"""Fresh database startup must initialize chat after registration tables.

This mirrors the local/CI E2E runtime: importing the router happens before
FastAPI startup, while the SQLite file has not yet received its core schema.
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
