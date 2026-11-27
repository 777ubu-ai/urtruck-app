"""Проверки ограничений точечной production-выкладки DAL ленты."""
import hashlib
import importlib.util
import json
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/ops/deploy_external_feed_dal_overlay.py"
SPEC = importlib.util.spec_from_file_location("external_feed_dal_overlay", SCRIPT)
overlay = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(overlay)


def test_payload_hash_matches_only_the_external_feed_dal():
    payload = ROOT / "backend" / overlay.FILE
    assert overlay.FILE == "database/external_freight_dal.py"
    assert hashlib.sha256(payload.read_bytes()).hexdigest() == overlay.TARGET_SHA256


def test_backup_and_restore_probe_cover_only_one_code_file(tmp_path, monkeypatch, capsys):
    root = tmp_path / "backend"
    (root / "database").mkdir(parents=True)
    (root / "main.py").write_text("# runtime\n")
    source = root / overlay.FILE
    source.write_text("# previous DAL\n")
    backup_root = tmp_path / "protected-backups"
    monkeypatch.setattr(overlay, "BACKUP_ROOT", backup_root)

    backup_id = overlay.backup(root.resolve(), 321)

    directory = backup_root / backup_id
    manifest = json.loads((directory / "manifest.json").read_text())
    assert manifest["scope"] == [overlay.FILE]
    assert manifest["before_sha256"] == hashlib.sha256(source.read_bytes()).hexdigest()
    assert manifest["uid"] == source.stat().st_uid
    assert (directory / Path(overlay.FILE).name).read_bytes() == source.read_bytes()
    assert not (directory / ".restore-probe").exists()
    assert "RESTORE_PROBE=PASS" in capsys.readouterr().out


def test_workflow_payload_and_operations_are_narrow():
    workflow_path = ROOT / ".github/workflows/deploy-external-feed-dal-production.yml"
    workflow = yaml.safe_load(workflow_path.read_text())
    source = workflow_path.read_text()
    trigger = workflow.get("on", workflow.get(True))
    assert set(trigger["workflow_dispatch"]["inputs"]["operation"]["options"]) == {
        "preflight", "deploy", "rollback"
    }
    assert "database/external_freight_dal.py" in source
    assert "chat" not in source.lower()
    assert "GPS" not in source
    assert "PUSH" not in source
    assert "DATABASE" not in source
    assert "rm -rf -- '$REMOTE_STAGE'" in source
