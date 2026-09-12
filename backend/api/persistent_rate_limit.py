"""SQLite-backed rate limiter для security-критичных endpoint'ов (/admin Basic Auth).

Почему SQLite sidecar, а не in-memory dict или Redis (аудит C1.1, 08.09.2026):
- in-memory dict теряет счётчики при рестарте процесса — рестарт uvicorn/worker
  сбрасывал бы накопленные failures и открывал окно для продолжения брутфорса;
- Redis в текущем деплое нет (REDIS_URL=localhost, лимитер в middleware.py был
  мёртвым кодом и удалён), а поднимать инфраструктурную зависимость ради
  счётчика неудачных логинов — лишняя точка отказа;
- SQLite уже есть в проекте (config.DB_PATH) — счётчики лежат в отдельном
  sidecar-файле рядом с основной БД и переживают рестарт процесса.

Fail-mode policy (источник истины — docs/security/rate-limit-fail-mode-policy.md):
admin/OTP/auth — FAIL-CLOSED. Если хранилище счётчиков недоступно, вызывающий
endpoint обязан ОТКЛОНИТЬ запрос (503 + лог), а не пропустить его без лимита.
Сбой инфраструктуры не должен превращаться в снятие защиты.

В хранилище — только счётчики неудач/блокировки по scope+subject (IP).
Никаких credentials или персональных данных.
"""
import sqlite3
import sys
import time
from pathlib import Path
from typing import Optional, Tuple

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import config

_DDL = """
CREATE TABLE IF NOT EXISTS rl_failures (
  scope TEXT NOT NULL,
  subject TEXT NOT NULL,
  failures INTEGER NOT NULL DEFAULT 0,
  blocked_until REAL NOT NULL DEFAULT 0,
  updated_at REAL NOT NULL,
  PRIMARY KEY (scope, subject)
);
"""


class RateLimitUnavailable(RuntimeError):
    """Хранилище счётчиков недоступно. Security-endpoint обязан отклонить
    запрос (fail-closed), а не пропустить без лимита."""


def _db_path() -> Path:
    p = Path(config.DB_PATH)
    return p.with_name(p.stem + ".ratelimits.db")


def _connect() -> sqlite3.Connection:
    path = _db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), timeout=10.0)
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute(_DDL)
    return conn


def _unavailable(exc: Exception, op: str, scope: str, subject: str) -> RateLimitUnavailable:
    print(
        f"[rate-limit] FAIL-CLOSED: хранилище счётчиков недоступно "
        f"({op}, scope={scope}, subject={subject}): {exc}",
        flush=True,
    )
    return RateLimitUnavailable(f"rate limit store unavailable during {op}: {exc}")


def check_allowed(scope: str, subject: str) -> Tuple[bool, int]:
    """Есть ли у subject право на попытку в scope.

    Возвращает (allowed, retry_after_seconds). retry_after > 0 только когда
    subject заблокирован. Бросает RateLimitUnavailable при сбое хранилища —
    вызывающий код обязан отклонить запрос (fail-closed).
    """
    now = time.time()
    try:
        with _connect() as conn:
            row = conn.execute(
                "SELECT blocked_until FROM rl_failures WHERE scope = ? AND subject = ?",
                (scope, subject),
            ).fetchone()
    except sqlite3.Error as exc:
        raise _unavailable(exc, "check_allowed", scope, subject) from exc
    if row is not None and row[0] > now:
        return False, max(1, int(row[0] - now))
    return True, 0


def record_failure(
    scope: str, subject: str, max_failures: int, block_seconds: int
) -> Optional[int]:
    """+1 к счётчику неудач subject в scope.

    При достижении max_failures неудач подряд ставит блокировку на
    block_seconds и возвращает retry_after. Иначе возвращает None.
    Просроченная блокировка сбрасывается — счёт идёт заново.
    Бросает RateLimitUnavailable при сбое хранилища (fail-closed у вызывающего).
    """
    now = time.time()
    try:
        with _connect() as conn:
            row = conn.execute(
                "SELECT failures, blocked_until FROM rl_failures "
                "WHERE scope = ? AND subject = ?",
                (scope, subject),
            ).fetchone()
            if row is None:
                failures = 1
                conn.execute(
                    "INSERT INTO rl_failures (scope, subject, failures, blocked_until, updated_at) "
                    "VALUES (?, ?, ?, 0, ?)",
                    (scope, subject, failures, now),
                )
                return None
            failures = row[0] + 1
            if row[1] and row[1] <= now:
                # блокировка протухла — считаем серию неудач заново
                failures = 1
            blocked_until = row[1] if (row[1] and row[1] > now) else 0.0
            if failures >= max_failures:
                blocked_until = now + block_seconds
            conn.execute(
                "UPDATE rl_failures SET failures = ?, blocked_until = ?, updated_at = ? "
                "WHERE scope = ? AND subject = ?",
                (failures, blocked_until, now, scope, subject),
            )
            if blocked_until > now:
                return max(1, int(blocked_until - now))
            return None
    except sqlite3.Error as exc:
        raise _unavailable(exc, "record_failure", scope, subject) from exc


def reset(scope: str, subject: str) -> None:
    """Сброс счётчика неудач (успешный вход). Fail-open с логом:
    запрос уже авторизован, обваливать его из-за cleanup нельзя."""
    try:
        with _connect() as conn:
            conn.execute(
                "DELETE FROM rl_failures WHERE scope = ? AND subject = ?",
                (scope, subject),
            )
    except sqlite3.Error as exc:
        print(
            f"[rate-limit] сброс счётчика не удалён (fail-open, запрос уже "
            f"авторизован, scope={scope}, subject={subject}): {exc}",
            flush=True,
        )


def reset_all() -> None:
    """Полная очистка счётчиков. Только для тестов."""
    try:
        with _connect() as conn:
            conn.execute("DELETE FROM rl_failures")
    except sqlite3.Error as exc:
        raise _unavailable(exc, "reset_all", "*", "*") from exc
