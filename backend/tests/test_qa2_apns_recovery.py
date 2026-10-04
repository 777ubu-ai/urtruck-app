"""Fault-injection coverage for QA2 APNs apply/rollback recovery."""
import base64
import importlib.util
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("qa2_apns_recovery", ROOT / "scripts" / "qa2_apns_recovery.py")
recovery = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(recovery)


def _payload(path):
    path.write_text(
        "\n".join((
            "APNS_KEY_ID=ABCD123456",
            "APNS_TEAM_ID=ZXCV987654",
            "APNS_AUTH_KEY_P8_BASE64=" + base64.b64encode(b"synthetic-p8").decode(),
            "APNS_BUNDLE_ID=com.urtruck.app",
            "APNS_USE_SANDBOX=false",
        )) + "\n",
        encoding="utf-8",
    )


def _paths(tmp_path):
    env = tmp_path / ".env"
    env.write_text("FCM_PROJECT_ID=keep\nAPNS_KEY_ID=old\n", encoding="utf-8")
    payload = tmp_path / "payload"
    _payload(payload)
    state = tmp_path / "state"
    backup = tmp_path / ".env.apns-backup.test"
    return env, payload, state, backup


def test_apply_keeps_backup_and_state_when_restart_fails(tmp_path):
    env, payload, state, backup = _paths(tmp_path)
    with pytest.raises(RuntimeError, match="restart failed"):
        recovery.apply_and_confirm(env, payload, state, backup, lambda: (_ for _ in ()).throw(RuntimeError("restart failed")))
    assert backup.read_text(encoding="utf-8") == "FCM_PROJECT_ID=keep\nAPNS_KEY_ID=old\n"
    assert "APPLIED_PENDING_HEALTH" in state.read_text(encoding="utf-8")
    assert "FCM_PROJECT_ID=keep" in env.read_text(encoding="utf-8")


def test_apply_copy_failure_does_not_replace_existing_environment(tmp_path, monkeypatch):
    env, payload, state, backup = _paths(tmp_path)
    monkeypatch.setattr(recovery.shutil, "copy2", lambda *_args, **_kwargs: (_ for _ in ()).throw(OSError("copy failed")))
    with pytest.raises(OSError, match="copy failed"):
        recovery.apply_and_confirm(env, payload, state, backup, lambda: None)
    assert env.read_text(encoding="utf-8") == "FCM_PROJECT_ID=keep\nAPNS_KEY_ID=old\n"
    assert not backup.exists()
    assert not state.exists()


def test_rollback_copy_failure_keeps_backup_and_state(tmp_path, monkeypatch):
    env, payload, state, backup = _paths(tmp_path)
    recovery.apply_and_confirm(env, payload, state, backup, lambda: None)
    original_copy = recovery.shutil.copy2
    monkeypatch.setattr(recovery.shutil, "copy2", lambda *_args, **_kwargs: (_ for _ in ()).throw(OSError("copy failed")))
    with pytest.raises(OSError, match="copy failed"):
        recovery.rollback_and_confirm(env, state, lambda: None)
    monkeypatch.setattr(recovery.shutil, "copy2", original_copy)
    assert backup.exists()
    assert state.exists()


def test_rollback_health_failure_keeps_backup_and_state(tmp_path):
    env, payload, state, backup = _paths(tmp_path)
    recovery.apply_and_confirm(env, payload, state, backup, lambda: None)
    with pytest.raises(RuntimeError, match="health failed"):
        recovery.rollback_and_confirm(env, state, lambda: (_ for _ in ()).throw(RuntimeError("health failed")))
    assert backup.exists()
    assert state.exists()
    assert "ROLLBACK_PENDING_HEALTH" in state.read_text(encoding="utf-8")


def test_confirmed_rollback_restores_env_before_cleanup(tmp_path):
    env, payload, state, backup = _paths(tmp_path)
    recovery.apply_and_confirm(env, payload, state, backup, lambda: None)
    recovery.rollback_and_confirm(env, state, lambda: None)
    assert env.read_text(encoding="utf-8") == "FCM_PROJECT_ID=keep\nAPNS_KEY_ID=old\n"
    assert not backup.exists()
    assert not state.exists()
