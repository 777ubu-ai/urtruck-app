from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_backend_deploy_keeps_runtime_db_outside_release_tree():
    deploy = (ROOT / "scripts/deploy-backend-safe.sh").read_text(encoding="utf-8")
    helper = (ROOT / "scripts/remote_backend_db_safety.sh").read_text(encoding="utf-8")

    assert "REMOTE_RUNTIME=${REMOTE_RUNTIME:-/home/ubuntu/urtruck/runtime}" in deploy
    assert "scripts/remote_backend_db_safety.sh" in deploy
    assert "urtruck_db_safety_${TS}.sh pre" in deploy
    assert "urtruck_db_safety_${TS}.sh post" in deploy
    assert "DB_COUNTS_SNAPSHOT=" in deploy

    assert "is_under_backend" in helper
    assert "configured DB_PATH is inside release tree" in helper
    assert "backup_db \"$old_path\" \"$db_path\"" in helper
    assert "write_env_db_path \"$db_path\"" in helper


def test_backend_deploy_checks_integrity_and_counts_before_after():
    helper = (ROOT / "scripts/remote_backend_db_safety.sh").read_text(encoding="utf-8")

    for table in ("drivers_registration", "cargos", "deals", "push_tokens_native", "push_devices"):
        assert table in helper
    assert "PRAGMA integrity_check;" in helper
    assert "import sqlite3" in helper
    assert "snapshot_counts \"$db_path\" \"$SNAPSHOT_FILE\"" in helper
    assert "snapshot_counts \"$db_path\" \"$after_file\"" in helper
    assert "compare_counts \"$SNAPSHOT_FILE\" \"$after_file\"" in helper
    assert "runtime table counts changed during deploy" in helper
