"""P0 release-blocker (Release Block 6): backend не должен падать при старте
на пустой/несуществующей БД.

Root cause #1 — table-order: api/chat.py _init() вызывал
_ensure_special_users() на уровне ИМПОРТА модуля, до того как
main.py.startup() успевал создать drivers_registration через
registration_dal.init_registration_schema(). Воспроизводилось:
`import main` на пустой БД → sqlite3.OperationalError: no such table:
drivers_registration.

Root cause #2 — directory-order: несколько модулей (например api/push.py)
делают DDL на уровне импорта через get_conn() напрямую, а mkdir каталога
БД жил только внутри init_db(), которую main.py вызывает уже В startup() —
то есть ПОСЛЕ этих import-time вызовов. На DB_PATH с ещё не созданным
каталогом падало sqlite3.OperationalError: unable to open database file —
уже на самом импорте main.py.

Оба класса закрыты: chat.py больше не трогает drivers_registration на
импорте (вызов перенесён в main.py startup(), после init_registration_schema()),
а database/db.get_conn() сам гарантирует существование каталога БД перед
первым connect — независимо от того, какой модуль первым откроет
соединение.

Тест запускает `import main` в ИЗОЛИРОВАННОМ subprocess (не в текущем
процессе — модули Python кэшируются в sys.modules, повторный import
внутри одного процесса не проверяет ничего) для каждого из 4 сценариев.

Run from backend/:
    python -m pytest tests/test_cold_start_fresh_db.py -q
"""
import os
import subprocess
import sys
import textwrap
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

_PROBE = textwrap.dedent("""
    import sys
    sys.path.insert(0, %r)
    import main
    from fastapi.testclient import TestClient
    c = TestClient(main.app)
    with c:
        r = c.get('/api/v1/system/info')
        assert r.status_code == 200, r.text
    print("COLD_START_OK")
""") % str(ROOT)


def _run_cold_start(db_path: str) -> subprocess.CompletedProcess:
    env = dict(os.environ)
    env.update({
        "DB_PATH": db_path,
        "URTRUCK_ENV": "development",
        "CGR_IIN_SALT": "x",
        "FILE_SIGNING_KEY": "k" * 40,
        "PYTHONPATH": str(ROOT),
    })
    return subprocess.run(
        [sys.executable, "-c", _PROBE],
        cwd=str(ROOT), env=env, capture_output=True, text=True, timeout=30,
    )


def _assert_cold_start_ok(result: subprocess.CompletedProcess, scenario: str):
    assert result.returncode == 0, (
        f"{scenario}: backend crashed on cold start\n"
        f"stdout: {result.stdout}\nstderr: {result.stderr[-3000:]}"
    )
    assert "COLD_START_OK" in result.stdout, (
        f"{scenario}: probe did not reach success marker\nstdout: {result.stdout}")


def test_missing_db_file_existing_directory(tmp_path):
    db = tmp_path / "security.db"
    assert not db.exists()
    r = _run_cold_start(str(db))
    _assert_cold_start_ok(r, "missing file, existing dir")


def test_missing_db_directory_entirely(tmp_path):
    db = tmp_path / "nested" / "does" / "not" / "exist" / "security.db"
    assert not db.parent.exists()
    r = _run_cold_start(str(db))
    _assert_cold_start_ok(r, "missing directory chain")


def test_empty_precreated_db_file(tmp_path):
    db = tmp_path / "security.db"
    db.touch()
    assert db.stat().st_size == 0
    r = _run_cold_start(str(db))
    _assert_cold_start_ok(r, "empty pre-created file")


def test_already_populated_db_restart_is_idempotent(tmp_path):
    db = tmp_path / "security.db"
    first = _run_cold_start(str(db))
    _assert_cold_start_ok(first, "first boot")
    second = _run_cold_start(str(db))
    _assert_cold_start_ok(second, "second boot on populated DB")
