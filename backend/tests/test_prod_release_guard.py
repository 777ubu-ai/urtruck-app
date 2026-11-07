"""Паспорт Production: деплой блокируется при ручных правках и без паспорта."""
import importlib.util
import json
from pathlib import Path

import pytest

_SPEC = importlib.util.spec_from_file_location(
    "prod_release_guard", Path(__file__).resolve().parents[2] / "scripts" / "ops" / "prod_release_guard.py")
guard = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(guard)
SHA = "a" * 40


@pytest.fixture()
def backend(tmp_path):
    root = tmp_path / "backend"
    (root / "api").mkdir(parents=True)
    (root / "api" / "push.py").write_text("print('push')\n", encoding="utf-8")
    (root / "main.py").write_text("app = 1\n", encoding="utf-8")
    # Не код — в паспорт не попадает и на проверку не влияет.
    (root / ".env").write_text("SECRET=1\n", encoding="utf-8")
    (root / "venv").mkdir()
    (root / "venv" / "x.py").write_text("x\n", encoding="utf-8")
    (root / "api" / "__pycache__").mkdir()
    (root / "api" / "__pycache__" / "push.cpython-312.pyc").write_bytes(b"\0")
    (root / "data.db").write_bytes(b"db")
    return root


def _run(*argv):
    return guard.main(list(argv))


def test_blob_hash_matches_git():
    assert guard.git_blob_sha1(b"") == "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391"


def test_no_manifest_blocks(backend, tmp_path, capsys):
    assert _run("verify", "--backend-dir", str(backend), "--manifest", str(tmp_path / "m.json")) == 2
    assert "BLOCKED_NO_MANIFEST" in capsys.readouterr().out


def test_record_then_verify_ok_and_ignores_non_code(backend, tmp_path, capsys):
    m = tmp_path / "m.json"
    assert _run("record", "--backend-dir", str(backend), "--manifest", str(m), "--source-sha", SHA, "--tag", "backend-v9") == 0
    files = json.loads(m.read_text(encoding="utf-8"))["files"]
    assert sorted(files) == ["api/push.py", "main.py"]
    (backend / ".env").write_text("SECRET=2\n", encoding="utf-8")  # секреты меняются свободно
    assert _run("verify", "--backend-dir", str(backend), "--manifest", str(m)) == 0
    assert f"PROD_RELEASE_SHA={SHA}" in capsys.readouterr().out


@pytest.mark.parametrize("mutate,kind", [
    (lambda b: (b / "main.py").write_text("app = 2\n", encoding="utf-8"), "changed: main.py"),
    (lambda b: (b / "api" / "push.py").unlink(), "missing: api/push.py"),
    (lambda b: (b / "api" / "hotfix.py").write_text("x\n", encoding="utf-8"), "extra: api/hotfix.py"),
])
def test_manual_drift_blocks(backend, tmp_path, capsys, mutate, kind):
    m = tmp_path / "m.json"
    _run("record", "--backend-dir", str(backend), "--manifest", str(m), "--source-sha", SHA)
    capsys.readouterr()
    mutate(backend)
    assert _run("verify", "--backend-dir", str(backend), "--manifest", str(m)) == 3
    out = capsys.readouterr().out
    assert "BLOCKED_DRIFT" in out and kind in out


def test_wrong_backend_dir_blocks(backend, tmp_path):
    m = tmp_path / "m.json"
    _run("record", "--backend-dir", str(backend), "--manifest", str(m), "--source-sha", SHA)
    other = tmp_path / "other"
    other.mkdir()
    assert _run("verify", "--backend-dir", str(other), "--manifest", str(m)) == 3


def test_record_rejects_short_sha(backend, tmp_path):
    assert _run("record", "--backend-dir", str(backend), "--manifest", str(tmp_path / "m.json"), "--source-sha", "abc") == 2
