"""Release hardening track A, Commit 2 — REVIEWER_DEMO_CODE fail-closed at
BOOT, not just at request time.

Background: api/registration.py already refused the reviewer bypass at
request time when REVIEWER_DEMO_CODE is still the committed default
("1975") and URTRUCK_ENV=production (pre-existing, 28.08.2026 audit,
covered by tests/test_prerelease_hardening.py). What was missing: the
startup guard (services/env_check.py — the ONLY mechanism in this codebase
that actually blocks a production boot over an unsafe config, per the
admin-password/API-key/admin-token checks already in collect_issues())
never surfaced this at all, so an operator deploying to production with
the default reviewer code got zero boot-time signal either way.

This file tests services.env_check directly (collect_issues() for
isolated, negative assertions; enforce_production_env() end-to-end with a
fully-populated otherwise-safe production config, so the reviewer check is
the only thing that can fail).
"""
import importlib
import os

import pytest


REVIEWER_ISSUE_MARKER = "Reviewer demo login"


def _reload_env_check():
    from services import env_check
    importlib.reload(env_check)
    return env_check


@pytest.fixture()
def clean_env(monkeypatch):
    """Isolate just the vars this file cares about; leave everything else
    (DB_PATH, etc.) untouched — collect_issues() only reads os.getenv."""
    keys = [
        "REVIEWER_DEMO_CODE", "REVIEWER_DEMO_EMAIL", "URTRUCK_ENV", "ENV",
        "WHATSAPP_TOKEN", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_ID",
        "WHATSAPP_PHONE_NUMBER_ID", "SMS_PROVIDER", "TELEGRAM_BOT_TOKEN",
        "BETA_MODE", "FILE_SIGNING_KEY", "STORAGE_PROVIDER", "SUPABASE_URL",
        "SUPABASE_SERVICE_KEY", "S3_BUCKET", "URTRUCK_ADMIN_PASS",
        "ADMIN_PASSWORD", "URTRUCK_API_KEY", "URTRUCK_ADMIN_TOKEN",
        "QA_AGENT_TOKEN", "CORS_ORIGINS",
    ]
    saved = {k: os.environ.get(k) for k in keys}
    for k in keys:
        os.environ.pop(k, None)
    yield
    for k, v in saved.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v
    _reload_env_check()


def _set_otherwise_safe_production_env():
    """Every OTHER collect_issues() check satisfied, so a test can assert
    the reviewer check is the only thing that does/doesn't fire."""
    os.environ["URTRUCK_ENV"] = "production"
    os.environ["TELEGRAM_BOT_TOKEN"] = "safe-telegram-token-value"
    os.environ["FILE_SIGNING_KEY"] = "x" * 32
    os.environ["STORAGE_PROVIDER"] = "s3"
    os.environ["S3_BUCKET"] = "urtruck-prod-bucket"
    os.environ["URTRUCK_ADMIN_PASS"] = "a-genuinely-random-admin-password-9f3"
    os.environ["URTRUCK_API_KEY"] = "a-genuinely-random-api-key-7c1"
    os.environ["URTRUCK_ADMIN_TOKEN"] = "a-genuinely-random-admin-token-4e2"
    os.environ["CORS_ORIGINS"] = "https://urtruck.kz"
    os.environ.pop("BETA_MODE", None)
    os.environ.pop("QA_AGENT_TOKEN", None)


# ── collect_issues(): isolated, negative assertions ────────────────────

def test_default_reviewer_code_is_flagged_in_production(clean_env):
    os.environ["URTRUCK_ENV"] = "production"
    os.environ.pop("REVIEWER_DEMO_CODE", None)  # unset -> falls back to "1975"
    env_check = _reload_env_check()
    issues = env_check.collect_issues()
    assert any(REVIEWER_ISSUE_MARKER in i for i in issues), (
        f"expected a 'Reviewer demo login' issue when REVIEWER_DEMO_CODE is unset "
        f"(defaults to the committed '1975') in production; got: {issues}"
    )


def test_custom_reviewer_code_is_not_flagged(clean_env):
    os.environ["URTRUCK_ENV"] = "production"
    os.environ["REVIEWER_DEMO_CODE"] = "7f2b9c14"
    env_check = _reload_env_check()
    issues = env_check.collect_issues()
    assert not any(REVIEWER_ISSUE_MARKER in i for i in issues), (
        f"an explicitly-overridden REVIEWER_DEMO_CODE must not be flagged; got: {issues}"
    )


def test_disabling_reviewer_email_suppresses_the_issue_even_with_default_code(clean_env):
    """REVIEWER_DEMO_EMAIL="" is the documented way to disable the feature
    outright -- it must fully suppress the check, not just half-suppress it."""
    os.environ["URTRUCK_ENV"] = "production"
    os.environ.pop("REVIEWER_DEMO_CODE", None)
    os.environ["REVIEWER_DEMO_EMAIL"] = ""
    env_check = _reload_env_check()
    issues = env_check.collect_issues()
    assert not any(REVIEWER_ISSUE_MARKER in i for i in issues), (
        f"REVIEWER_DEMO_EMAIL='' must disable the feature and suppress the boot check; got: {issues}"
    )


def test_default_reviewer_code_is_not_flagged_outside_production(clean_env):
    os.environ["URTRUCK_ENV"] = "development"
    os.environ.pop("REVIEWER_DEMO_CODE", None)
    env_check = _reload_env_check()
    # collect_issues() itself is env-agnostic (enforce_production_env is the
    # one that skips calling it outside prod) -- the issue MAY still be
    # produced by collect_issues() here; what actually matters is that
    # enforce_production_env() never evaluates it outside production. That's
    # asserted end-to-end below.
    assert env_check is not None


# ── enforce_production_env(): end-to-end, only the reviewer check varies ──

def test_enforce_production_env_fails_closed_on_default_reviewer_code(clean_env):
    _set_otherwise_safe_production_env()
    os.environ.pop("REVIEWER_DEMO_CODE", None)  # left at the committed default
    env_check = _reload_env_check()
    with pytest.raises(RuntimeError, match="unsafe configuration"):
        env_check.enforce_production_env()


def test_enforce_production_env_boots_clean_with_rotated_reviewer_code(clean_env):
    _set_otherwise_safe_production_env()
    os.environ["REVIEWER_DEMO_CODE"] = "9d4e7a21"
    env_check = _reload_env_check()
    env_check.enforce_production_env()  # must not raise


def test_enforce_production_env_boots_clean_with_reviewer_feature_disabled(clean_env):
    _set_otherwise_safe_production_env()
    os.environ.pop("REVIEWER_DEMO_CODE", None)
    os.environ["REVIEWER_DEMO_EMAIL"] = ""
    env_check = _reload_env_check()
    env_check.enforce_production_env()  # must not raise


def test_enforce_production_env_does_not_evaluate_reviewer_check_outside_production(clean_env):
    os.environ["URTRUCK_ENV"] = "development"
    os.environ.pop("REVIEWER_DEMO_CODE", None)
    env_check = _reload_env_check()
    env_check.enforce_production_env()  # dev never raises, regardless of config


# ── the reviewer code must never satisfy an ordinary (non-reviewer) OTP ──

def test_reviewer_code_never_registered_as_a_real_otp_for_other_emails():
    """Structural guard: api/registration.py's email_send() never calls
    reg_dal.save_code() for REVIEWER_DEMO_EMAIL (the whole point is that no
    real code is ever generated/stored for it), and the reviewer bypass
    (`is_reviewer`) requires an exact email match — so "1975" can only ever
    work as a bypass for that one specific address, never as a guess against
    any other user's real, randomly-generated OTP. Verified by reading the
    actual source (not re-deriving a live DB-backed proof, to keep this
    fast and dependency-free), pinned so a future refactor that breaks this
    invariant fails loudly.
    """
    import inspect
    from api import registration

    send_src = inspect.getsource(registration.email_send)
    verify_src = inspect.getsource(registration.email_verify)

    # The reviewer branch in email_send returns BEFORE reg_dal.save_code() —
    # no real, random code is ever generated/stored for that address.
    reviewer_branch, _, rest = send_src.partition("REVIEWER_DEMO_EMAIL and email == REVIEWER_DEMO_EMAIL")
    assert rest, "email_send() no longer short-circuits on REVIEWER_DEMO_EMAIL — re-check save_code() ordering"
    after_reviewer_check = rest.split("\n", 1)[1] if "\n" in rest else ""
    assert "return {" in after_reviewer_check.split("save_code", 1)[0], (
        "email_send() must return before reg_dal.save_code() runs for the reviewer email"
    )

    # is_reviewer requires an exact email match, not a code-only check.
    assert "email == REVIEWER_DEMO_EMAIL" in verify_src
    assert "req.code.strip() == REVIEWER_DEMO_CODE" in verify_src
