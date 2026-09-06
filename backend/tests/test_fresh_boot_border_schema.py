"""Fresh-process startup proof for border schema and deterministic catalog."""

import json
import os
import sqlite3
import subprocess
import sys


def test_fresh_startup_creates_border_schema_and_catalog(tmp_path):
    db_path = tmp_path / "fresh-boot.db"
    script = """
from fastapi.testclient import TestClient
from main import app
with TestClient(app) as client:
    response = client.get('/api/v1/borders/catalog')
    print(json.dumps({'status': response.status_code, 'body': response.json()}))
"""
    env = os.environ.copy()
    env.update({
        "PYTHONPATH": os.path.abspath("."),
        "URTRUCK_ENV": "test",
        "ENV": "test",
        "DB_PATH": str(db_path),
        "CGR_FEATURE_ENABLED": "true",
    })
    env.pop("CGR_IIN_SALT", None)
    result = subprocess.run(
        [sys.executable, "-c", "import json\n" + script],
        cwd=os.path.dirname(os.path.dirname(__file__)),
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    payload_line = next(
        line for line in reversed(result.stdout.splitlines()) if line.startswith("{")
    )
    payload = json.loads(payload_line)
    assert payload["status"] == 200, payload
    assert payload["body"]["checkpoints"]

    with sqlite3.connect(db_path) as conn:
        tables = {
            row[0]
            for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
    assert "border_checkpoints" in tables
