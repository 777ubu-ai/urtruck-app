"""Блок 7 аудита (P0-побочный): backend/main.py раньше БЕЗУСЛОВНО
перезаписывал os.environ значениями из backend/.env — заданный СНАРУЖИ
DB_PATH (например, при запуске тестов на изолированной /tmp-БД) тихо
терялся и подменялся на тот, что лежит в .env (в этом репозитории —
реальный локальный backend/database/security_cgr.db). Именно так один из
аудит-агентов случайно записал 2 тестовые строки в локальную dev-БД.

Проверяем:
  1) внешний DB_PATH побеждает значение из backend/.env (используем
     РЕАЛЬНЫЙ backend/.env репозитория — только читаем, не модифицируем);
  2) .env заполняет DB_PATH, только если он не задан снаружи (на
     изолированной копии backend/ во временной директории — реальный
     backend/.env не трогаем);
  3) guard: ENV=test + DB_PATH, похожий на серверный путь (/home/ubuntu/...)
     → процесс завершается немедленно (sys.exit(1)) до подключения к БД.

Каждый сценарий — отдельный subprocess (`python -c "..."`), чтобы
исключить утечку os.environ/import-кэша между кейсами. Ничего не
дописывается в реальный backend/.env, реальный backend/database/*.db не
модифицируется — все временные БД создаются в /tmp и удаляются в конце.

Run from backend/:
    ./venv/bin/python -m tests.test_env_db_path_priority
Exit != 0 на любой ошибке. Совместим с pytest (функции test_*).
"""
import os
import shutil
import subprocess
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent  # backend/
PYTHON = str(ROOT / "venv" / "bin" / "python")
if not Path(PYTHON).exists():
    PYTHON = sys.executable

_INIT_AND_IMPORT_MAIN = (
    "import os, sys\n"
    "sys.path.insert(0, '.')\n"
    "from database import db\n"
    "db.init_db()\n"
    "from database import registration_dal\n"
    "registration_dal.init_registration_schema()\n"
    "import main\n"
    "print('DB_PATH_RESULT=' + os.environ['DB_PATH'])\n"
)


def _run(cwd: Path, env: dict, script: str, timeout: int = 40):
    return subprocess.run(
        [PYTHON, "-c", script], cwd=str(cwd), env=env,
        capture_output=True, text=True, timeout=timeout,
    )


def test_external_db_path_wins_over_real_dotenv():
    """Использует настоящий backend/.env репозитория (read-only) — он
    задаёт DB_PATH на локальный security_cgr.db. Внешний DB_PATH должен
    победить и остаться в os.environ после импорта main."""
    real_env_file = ROOT / ".env"
    if not real_env_file.exists():
        return  # нет .env в этом checkout — сценарий неприменим, не баг
    test_db = f"/tmp/urtruck_test_prio_{uuid.uuid4().hex}.db"
    env = os.environ.copy()
    env["DB_PATH"] = test_db
    env.pop("ENV", None)
    try:
        r = _run(ROOT, env, _INIT_AND_IMPORT_MAIN)
        assert r.returncode == 0, f"import main упал: {r.stderr[-2000:]}"
        assert f"DB_PATH_RESULT={test_db}" in r.stdout, (
            f"внешний DB_PATH не победил .env! stdout={r.stdout[-500:]}"
        )
        # .env этого репо указывает на security_cgr.db — убеждаемся, что
        # именно ЭТОТ путь НЕ просочился в итоговый os.environ.
        assert "security_cgr.db" not in r.stdout.split("DB_PATH_RESULT=")[-1].splitlines()[0]
    finally:
        Path(test_db).unlink(missing_ok=True)


def test_dotenv_fills_db_path_only_when_unset(tmp_backend_copy=None):
    """Изолированная копия backend/ (НЕ реальный репозиторий) с фейковым
    .env — проверяем, что DB_PATH из .env реально применяется, когда
    снаружи он не задан (setdefault-ветка).

    Схему нужно создать ДО `import main` (иначе module-level `_init()` в
    api/chat.py упадёт на пустой БД — независимая особенность порядка
    инициализации, не связанная с этим фиксом). Поскольку сам тест и
    задаёт значение, которое положит .env, схема сначала создаётся под
    известным путём напрямую, а затем DB_PATH из окружения СНИМАЕТСЯ —
    чтобы `import main` реально прошёл через ветку `setdefault` из .env,
    а не унаследовал уже выставленную переменную."""
    work = Path(f"/tmp/urtruck_backend_copy_{uuid.uuid4().hex}")
    fake_db = f"/tmp/urtruck_test_dotenv_{uuid.uuid4().hex}.db"
    try:
        shutil.copytree(
            ROOT, work,
            ignore=shutil.ignore_patterns(
                "venv", "__pycache__", "*.db", "storage", ".env",
                "*.png", ".pytest_cache",
            ),
        )
        fake_storage = f"/tmp/urtruck_test_storage_{uuid.uuid4().hex}"
        (work / ".env").write_text(
            f"DB_PATH={fake_db}\nURTRUCK_ENV=development\nSTORAGE_LOCAL_ROOT={fake_storage}\n",
            encoding="utf-8",
        )
        env = os.environ.copy()
        env.pop("DB_PATH", None)
        env.pop("ENV", None)
        script = (
            f"import os, sys\n"
            f"sys.path.insert(0, '.')\n"
            f"os.environ['DB_PATH'] = {fake_db!r}\n"  # pre-init only
            f"from database import db\n"
            f"db.init_db()\n"
            f"from database import registration_dal\n"
            f"registration_dal.init_registration_schema()\n"
            f"del os.environ['DB_PATH']\n"  # снято — теперь .env обязан подставить сам
            f"import main\n"
            f"print('DB_PATH_RESULT=' + os.environ['DB_PATH'])\n"
        )
        r = _run(work, env, script)
        assert r.returncode == 0, f"import main упал: {r.stderr[-2000:]}"
        assert f"DB_PATH_RESULT={fake_db}" in r.stdout, (
            f".env не заполнил отсутствующий DB_PATH: {r.stdout[-500:]}"
        )
    finally:
        shutil.rmtree(work, ignore_errors=True)
        Path(fake_db).unlink(missing_ok=True)
        shutil.rmtree(fake_storage, ignore_errors=True)


def test_guard_blocks_test_env_against_prod_like_path():
    """ENV=test + DB_PATH похожий на серверный (/home/ubuntu/...) —
    процесс обязан завершиться немедленно, до какого-либо обращения к БД."""
    env = os.environ.copy()
    env["ENV"] = "test"
    env["DB_PATH"] = "/home/ubuntu/urtruck/backend/database/security.db"
    r = _run(ROOT, env, "import main\n", timeout=15)
    assert r.returncode != 0, f"guard не сработал! exit={r.returncode}, stdout={r.stdout}"
    assert "ФАТАЛЬНО" in r.stdout, f"нет ожидаемого сообщения guard: {r.stdout}"
    # Гарантия, что упали ДО импорта роутеров/БД (а не на что-то другое).
    assert "Traceback" not in r.stderr or "sqlite3" not in r.stderr


def test_guard_allows_test_env_with_tmp_path():
    """ENV=test + DB_PATH под /tmp — не серверный путь, guard не должен
    мешать (тесты и так всегда используют /tmp)."""
    test_db = f"/tmp/urtruck_test_guard_ok_{uuid.uuid4().hex}.db"
    env = os.environ.copy()
    env["ENV"] = "test"
    env["DB_PATH"] = test_db
    try:
        r = _run(ROOT, env, _INIT_AND_IMPORT_MAIN)
        assert r.returncode == 0, f"guard ошибочно заблокировал /tmp-путь: {r.stdout} {r.stderr[-1000:]}"
        assert "ФАТАЛЬНО" not in r.stdout
    finally:
        Path(test_db).unlink(missing_ok=True)


if __name__ == "__main__":
    fails = 0
    for fn in [test_external_db_path_wins_over_real_dotenv,
               test_dotenv_fills_db_path_only_when_unset,
               test_guard_blocks_test_env_against_prod_like_path,
               test_guard_allows_test_env_with_tmp_path]:
        try:
            fn(); print(f"  ✅ {fn.__name__}")
        except Exception as e:
            fails += 1; print(f"  ❌ {fn.__name__}: {e}")
    print(f"\n{'ВСЕ ЗЕЛЁНЫЕ' if not fails else str(fails)+' FAIL'}")
    sys.exit(1 if fails else 0)
