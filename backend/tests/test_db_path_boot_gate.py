"""Regression lock: services/env_check.py's production boot guard refuses an
ephemeral DB_PATH (§18/§22 hardening, 2026-09-14).

Root cause: collect_issues() checked OTP/Storage/Admin/CORS/QA-token but had
no opinion at all about DB_PATH. main.py's own separate startup guard (top of
the file, runs before this module is even imported) only catches the
opposite mistake -- ENV=test accidentally pointed at the server's real
/home/ubuntu/... path. Nothing caught the production-destructive mistake: an
operator setting DB_PATH=:memory: (every row gone on the next restart) or
DB_PATH=/tmp/whatever (wiped on reboot / by a tmp-cleaner cron) in a real
URTRUCK_ENV=production deploy. Both are silent until the next restart, at
which point every driver/cargo/bid/message/GPS row is just gone.
"""
import importlib
import os

import pytest


DB_ISSUE_MARKER = "Database:"


def _reload_env_check():
    from services import env_check
    importlib.reload(env_check)
    return env_check


@pytest.fixture()
def clean_db_env(monkeypatch):
    saved = os.environ.get("DB_PATH")
    monkeypatch.delenv("DB_PATH", raising=False)
    yield
    if saved is None:
        os.environ.pop("DB_PATH", None)
    else:
        os.environ["DB_PATH"] = saved
    _reload_env_check()


def test_in_memory_db_path_is_flagged(clean_db_env):
    os.environ["DB_PATH"] = ":memory:"
    env_check = _reload_env_check()
    issues = env_check.collect_issues()
    assert any(DB_ISSUE_MARKER in i and "memory" in i for i in issues), issues


def test_tmp_db_path_is_flagged(clean_db_env):
    os.environ["DB_PATH"] = "/tmp/urtruck-oops.db"
    env_check = _reload_env_check()
    issues = env_check.collect_issues()
    assert any(DB_ISSUE_MARKER in i for i in issues), issues


def test_var_tmp_db_path_is_flagged(clean_db_env):
    os.environ["DB_PATH"] = "/var/tmp/urtruck.db"
    env_check = _reload_env_check()
    issues = env_check.collect_issues()
    assert any(DB_ISSUE_MARKER in i for i in issues), issues


def test_real_persistent_db_path_is_not_flagged(clean_db_env):
    os.environ["DB_PATH"] = "/home/ubuntu/urtruck/backend/database/security.db"
    env_check = _reload_env_check()
    issues = env_check.collect_issues()
    assert not any(DB_ISSUE_MARKER in i for i in issues), issues


def test_unset_db_path_is_not_flagged(clean_db_env):
    """Unset DB_PATH is fine -- config.py's own default resolves to a real
    persistent path; this guard must not fire on the common "operator never
    overrode it" case."""
    env_check = _reload_env_check()
    issues = env_check.collect_issues()
    assert not any(DB_ISSUE_MARKER in i for i in issues), issues


def test_a_path_that_merely_contains_tmp_as_a_substring_is_not_flagged(clean_db_env):
    """Guard against an overly broad substring match -- only a path that
    actually starts in a temp directory should trip this, not any path with
    'tmp' somewhere in a directory or file name."""
    os.environ["DB_PATH"] = "/home/ubuntu/urtruck/backend/database/nottmp.db"
    env_check = _reload_env_check()
    issues = env_check.collect_issues()
    assert not any(DB_ISSUE_MARKER in i for i in issues), issues
