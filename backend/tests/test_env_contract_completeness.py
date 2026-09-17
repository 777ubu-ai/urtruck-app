"""Release hardening track A, Commit 3 — backend env contract regression.

Static coverage: every environment variable actually read anywhere in
backend/ runtime code (os.getenv/os.environ, plus cgr/settings.py's
pydantic-settings CGR_* prefix) must have a corresponding line in
backend/.env.example, with a documented, explicit allowlist for the few
names that are deliberately NOT meant to appear there (pytest-harness-only
internal markers, not real deployment config).

This does not re-litigate WHICH vars are required-vs-optional-vs-dev-only —
that classification lives in .env.example's own section comments (see the
file itself for "REQUIRED", "optional", "QA-only", "Dev/demo-only" markers)
— it only guards against the specific failure mode a prior audit found:
code reads a var that .env.example never mentions at all, so a fresh
production setup has no way to discover it needs configuring.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV_EXAMPLE = ROOT / ".env.example"

# Deliberately excluded from the documentation requirement: not real
# deployment config, just a pytest-collection-time internal marker (see
# tests/conftest.py) that would be actively misleading to suggest setting
# in a real .env file.
TEST_HARNESS_ONLY = {"URTRUCK_TEST_HARNESS_OWNS_DB"}

# ENV is documented via its own line's comment (legacy fallback for
# URTRUCK_ENV) rather than as a standalone `ENV=` assignment — accepted as
# "documented" if the bare word ENV appears anywhere in the file's prose,
# not just as a `KEY=` line, since re-asserting `ENV=` right next to
# `URTRUCK_ENV=` would suggest they're two independent settings to fill in
# rather than one primary + one fallback name for the same setting.
DOCUMENTED_VIA_PROSE_ONLY = {"ENV"}

VAR_PATTERN = re.compile(
    r"os\.getenv\(\s*[\"']([A-Z0-9_]+)[\"']"
    r"|os\.environ\[[\"']([A-Z0-9_]+)[\"']\]"
    r"|os\.environ\.get\(\s*[\"']([A-Z0-9_]+)[\"']"
)

# cgr/settings.py reads these via pydantic-settings' env_prefix="CGR_", not
# os.getenv — enumerate the field names directly rather than trying to
# regex-parse a BaseSettings class body.
CGR_SETTINGS_FIELDS = [
    "base_url", "user_agent", "request_timeout_sec",
    "scoreboard_interval_min", "booking_poll_interval_min",
    "blocklist_cron", "iin_salt", "rate_limit_requests_per_min",
    "feature_enabled", "push_throttle_minutes",
]
CGR_ENV_VARS = {f"CGR_{f.upper()}" for f in CGR_SETTINGS_FIELDS}

# Only repository-owned runtime Python is part of this contract.  A local
# virtualenv may contain third-party packages whose examples legitimately read
# host/tooling variables (PATH, PYTEST_*, WEBSOCKETS_*, etc.); treating those
# as UrTruck configuration creates false failures and makes the result depend
# on which developer environment happens to be installed.
IGNORED_DIR_NAMES = {
    "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache",
    "node_modules", "build", "dist", "coverage", "artifacts",
    "tmp", "temp",
}


def _is_generated_or_external(path: Path) -> bool:
    return any(
        part in IGNORED_DIR_NAMES or part.startswith(".venv")
        for part in path.parts
    )


def _code_vars():
    found = set()
    for path in ROOT.rglob("*.py"):
        if _is_generated_or_external(path) or "tests" in path.parts:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        for m in VAR_PATTERN.finditer(text):
            found.add(next(g for g in m.groups() if g))
    return found | CGR_ENV_VARS


def _documented_vars():
    text = ENV_EXAMPLE.read_text(encoding="utf-8")
    assigned = set(re.findall(r"(?m)^([A-Z0-9_]+)=", text))
    prose = set(re.findall(r"\b([A-Z][A-Z0-9_]{2,})\b", text))
    return assigned, assigned | prose


def test_env_example_exists():
    assert ENV_EXAMPLE.exists(), "backend/.env.example is missing entirely"


def test_every_code_read_env_var_is_documented():
    code_vars = _code_vars()
    assigned, assigned_or_prose = _documented_vars()

    missing = []
    for var in sorted(code_vars):
        if var in TEST_HARNESS_ONLY:
            continue
        if var in DOCUMENTED_VIA_PROSE_ONLY:
            if var not in assigned_or_prose:
                missing.append(var)
            continue
        if var not in assigned:
            missing.append(var)

    assert not missing, (
        "the following env vars are read by backend code but have no "
        f"corresponding line in backend/.env.example: {missing}\n"
        "Add a documented (name-only, no real secret value) entry — see "
        "Commit 3 of the release-hardening-a track for the classification "
        "convention (REQUIRED / optional / QA-only / dev-demo-only)."
    )


def test_no_stale_unused_names_pretend_to_be_real_config():
    """Regression pin for the specific defect this track found: bare
    ADMIN_USER / ADMIN_PASSWORD used to sit in .env.example looking like
    real config, while the app only ever reads URTRUCK_ADMIN_USER /
    URTRUCK_ADMIN_PASS. Confirm those two names are UNSET placeholders now
    (present for backward-compat documentation, not implying they do
    anything), not populated with a value that looks authoritative."""
    text = ENV_EXAMPLE.read_text(encoding="utf-8")
    for line in text.splitlines():
        if line.startswith("ADMIN_USER=") or line.startswith("ADMIN_PASSWORD="):
            value = line.split("=", 1)[1].strip()
            assert value == "", (
                f"{line!r}: ADMIN_USER/ADMIN_PASSWORD are not read by any runtime "
                "code path (only URTRUCK_ADMIN_USER/URTRUCK_ADMIN_PASS are) — giving "
                "them a non-empty example value here would mislead an operator into "
                "thinking they configure admin auth."
            )
    assert "URTRUCK_FAIL_ON_BAD_ENV" not in text, (
        "URTRUCK_FAIL_ON_BAD_ENV was documented but never read by any code — "
        "production's env-check gate is unconditionally hard-blocking; re-introducing "
        "this name would imply a soft-fail opt-out that doesn't exist"
    )


def test_env_check_admin_password_gate_matches_what_admin_py_actually_reads():
    """Regression pin for the false-sense-of-security bug this track found:
    services/env_check.py used to accept a legacy ADMIN_PASSWORD env var as
    a fallback for its "is the admin password still the default" check —
    but api/admin.py's REAL auth check never reads ADMIN_PASSWORD at all,
    only URTRUCK_ADMIN_PASS. Setting only the (unread) legacy name used to
    make collect_issues() report the admin password as safely configured
    while the actual admin panel auth silently used its own committed
    default underneath. Confirm the fallback is gone."""
    import inspect
    from services import env_check

    src = inspect.getsource(env_check.collect_issues)
    assert 'os.getenv("ADMIN_PASSWORD"' not in src, (
        "env_check.py must check ONLY URTRUCK_ADMIN_PASS (what api/admin.py "
        "actually authenticates against), not a legacy ADMIN_PASSWORD fallback "
        "nothing else in the app reads"
    )
    assert 'os.getenv("URTRUCK_ADMIN_PASS"' in src


if __name__ == "__main__":
    import sys
    failures = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"PASS: {name}")
            except AssertionError as e:
                failures += 1
                print(f"FAIL: {name}\n  {e}")
    print(f"\n{failures} failure(s)")
    sys.exit(1 if failures else 0)
