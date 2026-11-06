import hashlib
import json
import sqlite3
import sys
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from scripts.ops import production_push_mode_backup as backup


def _pm2_rows(root: Path):
    names = (backup.API_PROCESS, backup.SCHEDULER_PROCESS)
    return [
        {"name": name, "pid": i + 100, "pm2_env": {
            "status": "online", "PUSH_PROVIDER_MODE": "native", "pm_cwd": str(root),
        }}
        for i, name in enumerate(names)
    ]


def _saved_rows():
    return [
        {"name": name, "pm_cwd": "/srv/urtruck/backend", "pm_exec_path": f"/srv/{name}.py",
         "exec_mode": "fork_mode", "args": [], "env": {"PUSH_PROVIDER_MODE": "native", "SAFE": "same"}}
        for name in (backup.API_PROCESS, backup.SCHEDULER_PROCESS)
    ] + [{"name": "other", "pm_cwd": "/srv/other", "pm_exec_path": "/srv/other/app.js",
          "exec_mode": "fork_mode", "args": [], "env": {"SAFE": "unchanged"}}]


def test_create_backup_makes_private_consistent_db_and_pm2_snapshot(tmp_path):
    home = tmp_path / "home"
    project = home / "urtruck"
    backend = project / "backend"
    backups = project / "backups"
    pm2_home = home / ".pm2"
    backend.mkdir(parents=True)
    backups.mkdir()
    pm2_home.mkdir()
    services = backend / "services"
    services.mkdir()
    gateway = services / "push_gateway.py"
    sender = services / "push_sender.py"
    gateway.write_bytes(b"reviewed gateway fixture")
    sender.write_bytes(b"reviewed sender fixture")
    db = project / "runtime/security.db"
    db.parent.mkdir()
    with sqlite3.connect(db) as conn:
        conn.execute("CREATE TABLE deals(id INTEGER PRIMARY KEY, state TEXT)")
        conn.execute("INSERT INTO deals(state) VALUES('active')")
    (backend / ".env").write_text(
        f"PUSH_PROVIDER_MODE=dual\nDB_PATH={db}\nPRIVATE_TEST_SECRET=not copied\n", encoding="utf-8"
    )
    rows = _saved_rows()
    (pm2_home / "dump.pm2").write_text(json.dumps(rows), encoding="utf-8")

    old_project, old_backend = backup.PROJECT_ROOT, backup.BACKEND_ROOT
    old_source_hashes = backup.EXPECTED_SOURCE_SHA256
    old_file_count, old_inventory_hash = backup.EXPECTED_RUNTIME_FILE_COUNT, backup.EXPECTED_RUNTIME_INVENTORY_SHA256
    fixture_hashes = {
        "services/push_gateway.py": hashlib.sha256(gateway.read_bytes()).hexdigest(),
        "services/push_sender.py": hashlib.sha256(sender.read_bytes()).hexdigest(),
    }
    canonical = "\n".join(f"{name} {digest}" for name, digest in sorted(fixture_hashes.items()))
    try:
        backup.PROJECT_ROOT, backup.BACKEND_ROOT = project, backend
        backup.EXPECTED_SOURCE_SHA256 = fixture_hashes
        backup.EXPECTED_RUNTIME_FILE_COUNT = 2
        backup.EXPECTED_RUNTIME_INVENTORY_SHA256 = hashlib.sha256(canonical.encode()).hexdigest()
        with patch("pathlib.Path.home", return_value=home):
            result = backup.create_backup(backend, "12345", json.dumps(_pm2_rows(backend)))
    finally:
        backup.PROJECT_ROOT, backup.BACKEND_ROOT = old_project, old_backend
        backup.EXPECTED_SOURCE_SHA256 = old_source_hashes
        backup.EXPECTED_RUNTIME_FILE_COUNT, backup.EXPECTED_RUNTIME_INVENTORY_SHA256 = old_file_count, old_inventory_hash

    directory = Path(result["directory"])
    assert directory.stat().st_mode & 0o777 == 0o700
    assert (directory / "pm2.dump.before.json").stat().st_mode & 0o777 == 0o600
    assert (directory / "security.db.before.sqlite").stat().st_mode & 0o777 == 0o600
    assert (directory / "record.json").stat().st_mode & 0o777 == 0o600
    assert result["database_quick_check"] == "ok"
    assert result["pm2_dump_sha256"] == hashlib.sha256((directory / "pm2.dump.before.json").read_bytes()).hexdigest()
    with sqlite3.connect(f"file:{directory / 'security.db.before.sqlite'}?mode=ro", uri=True) as conn:
        assert conn.execute("SELECT state FROM deals").fetchone()[0] == "active"
    assert "not copied" not in (directory / "record.json").read_text()


def test_verify_persisted_dump_requires_dual_and_preserves_other_pm2_apps(tmp_path):
    before = tmp_path / "before.json"
    after = tmp_path / "after.json"
    old = _saved_rows()
    new = json.loads(json.dumps(old))
    for row in new[:2]:
        row["env"]["PUSH_PROVIDER_MODE"] = "dual"
    before.write_text(json.dumps(old), encoding="utf-8")
    after.write_text(json.dumps(new), encoding="utf-8")

    backup.verify_persisted_dump(before, after, "dual")

    new[2]["env"]["SAFE"] = "changed"
    after.write_text(json.dumps(new), encoding="utf-8")
    try:
        backup.verify_persisted_dump(before, after, "dual")
    except ValueError as exc:
        assert "configuration changed" in str(exc)
    else:
        raise AssertionError("non-target PM2 configuration drift must fail closed")
