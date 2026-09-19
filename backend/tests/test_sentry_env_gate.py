"""§24 hardening (2026-09-14): main.py's Sentry init must not fire the
committed production DSN outside a genuine production environment, and must
never mislabel non-production events as environment="production".

Root cause: `_sentry_dsn = os.getenv("SENTRY_DSN", _DEFAULT_SENTRY_DSN)` used
to apply the committed default DSN unconditionally, regardless of
URTRUCK_ENV/ENV — every `import main` (every pytest run, every isolated/CI
backend in this repo, which has no committed .env and therefore no
SENTRY_DSN override) sent real telemetry to the production Sentry project.
Worse, `environment=os.getenv("SENTRY_ENVIRONMENT", "production")` defaulted
to "production" even when the process was actually ENV=test/development, so
CI/test noise landed in Sentry mislabeled as real production errors —
actively misleading for anyone triaging the dashboard.

Each case runs `import main` in a real subprocess (matching the existing
tests/test_env_db_path_priority.py pattern) so os.environ/import-cache
cannot leak between cases, and so this exercises the exact same module-level
code path a real process boot goes through.
"""
import os
import subprocess
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent  # backend/
PYTHON = str(ROOT / "venv" / "bin" / "python")
if not Path(PYTHON).exists():
    PYTHON = sys.executable


def _run(env: dict, timeout: int = 40):
    return subprocess.run(
        [PYTHON, "-c", "import main\n"], cwd=str(ROOT), env=env,
        capture_output=True, text=True, timeout=timeout,
    )


def _base_env(db_path: str) -> dict:
    env = os.environ.copy()
    env["DB_PATH"] = db_path
    # This suite isolates Sentry wiring. Avoid creating the production-local
    # storage root when a case intentionally sets ENV=production on a Mac/CI
    # host; production itself uses Supabase storage.
    env["STORAGE_PROVIDER"] = "supabase"
    # No .env is committed in this repo, so SENTRY_DSN is only set here when
    # a case explicitly wants the opt-in path.
    env.pop("SENTRY_DSN", None)
    env.pop("SENTRY_ENVIRONMENT", None)
    return env


def test_test_env_never_calls_the_committed_default_dsn():
    """The concrete regression: ENV=test (every isolated backend / CI run in
    this repo) must not silently phone home to the real production DSN."""
    test_db = f"/tmp/urtruck_sentry_test_{uuid.uuid4().hex}.db"
    env = _base_env(test_db)
    env["ENV"] = "test"
    try:
        r = _run(env)
        assert r.returncode == 0, f"import main failed: {r.stderr[-2000:]}"
        assert "[sentry] skipped" in r.stdout, r.stdout[-1000:]
        assert "[sentry] initialized" not in r.stdout, r.stdout[-1000:]
    finally:
        Path(test_db).unlink(missing_ok=True)


def test_development_env_never_calls_the_committed_default_dsn():
    test_db = f"/tmp/urtruck_sentry_dev_{uuid.uuid4().hex}.db"
    env = _base_env(test_db)
    env["ENV"] = "development"
    try:
        r = _run(env)
        assert r.returncode == 0, f"import main failed: {r.stderr[-2000:]}"
        assert "[sentry] skipped" in r.stdout, r.stdout[-1000:]
        assert "[sentry] initialized" not in r.stdout, r.stdout[-1000:]
    finally:
        Path(test_db).unlink(missing_ok=True)


def test_production_env_still_uses_the_committed_default_dsn():
    """Non-regression: real production deploys (ENV unset -> defaults to
    'production', or set explicitly) must keep working exactly as before --
    this fix only narrows *non*-production, it must not silently disable
    monitoring for real production traffic."""
    test_db = f"/tmp/urtruck_sentry_prod_{uuid.uuid4().hex}.db"
    env = _base_env(test_db)
    env["ENV"] = "production"
    try:
        r = _run(env)
        assert r.returncode == 0, f"import main failed: {r.stderr[-2000:]}"
        assert "[sentry] initialized" in r.stdout, r.stdout[-1000:]
    finally:
        Path(test_db).unlink(missing_ok=True)


def test_explicit_sentry_dsn_override_still_works_outside_production_and_is_labeled_correctly():
    """An operator explicitly wiring a staging Sentry project (e.g. for a
    preview env) must still work -- and get tagged with the REAL
    environment, not a hardcoded 'production'."""
    test_db = f"/tmp/urtruck_sentry_preview_{uuid.uuid4().hex}.db"
    env = _base_env(test_db)
    env["ENV"] = "preview"
    # A syntactically valid but unreachable DSN -- sentry_sdk.init() does not
    # perform a network call itself, so this proves wiring without requiring
    # real network access from the test.
    env["SENTRY_DSN"] = "https://abc123@o0.ingest.sentry.io/0"
    try:
        r = _run(env)
        assert r.returncode == 0, f"import main failed: {r.stderr[-2000:]}"
        assert "[sentry] initialized" in r.stdout, r.stdout[-1000:]
    finally:
        Path(test_db).unlink(missing_ok=True)
