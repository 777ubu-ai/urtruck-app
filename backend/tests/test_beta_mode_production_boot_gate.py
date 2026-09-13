"""Full Product Audit (2026-09-13), Agent B P2 follow-up — BETA_MODE role-flip
in production: PROVEN_NON_PRODUCTION, locked with a regression test.

Background: the audit found that BETA-mode login (`is_beta_login` in
api/registration.py) can flip an existing account's role the same way the
three P0s fixed on this branch (b9ea7527, 3dcaf1b6) could -- flagged as a P2
because BETA_MODE is off by default in production and there is already a
boot-time fail-closed guard (services/env_check.py) that refuses to start a
`URTRUCK_ENV=production` process with BETA_MODE explicitly enabled. What was
missing was a regression test actually proving that guard fires for
BETA_MODE specifically -- every *other* collect_issues() check in
env_check.py has one (admin password, API key, admin token, reviewer demo
code -- see test_release_hardening_a_reviewer_boot_gate.py), but BETA_MODE
did not, despite services/env_check.py's own comment ("Stage 22: BETA_MODE
in production is a security hole") describing exactly this risk.

This file closes that gap on both layers:
  1. config.py's own default (BETA_MODE defaults to "false" when
     URTRUCK_ENV=="production" and the operator never set the var at all).
  2. services/env_check.py's boot-time fail-closed guard (refuses to start
     if BETA_MODE is explicitly forced on in production), mirroring the
     existing reviewer-demo-code test file's structure exactly.

No production code changed by this commit -- the guard already existed
(env_check.py:70-74) and was simply untested. This is a test-only
regression-lock commit.
"""
import importlib
import os

import pytest


BETA_ISSUE_MARKER = "BETA_MODE"


def _reload_env_check():
    from services import env_check
    importlib.reload(env_check)
    return env_check


def _reload_config():
    import config
    importlib.reload(config)
    return config


@pytest.fixture()
def clean_env(monkeypatch):
    """Isolate just the vars this file cares about; leave everything else
    (DB_PATH, etc.) untouched -- collect_issues()/config.py only read
    os.getenv."""
    keys = [
        "BETA_MODE", "URTRUCK_ENV", "ENV",
        "REVIEWER_DEMO_CODE", "REVIEWER_DEMO_EMAIL",
        "WHATSAPP_TOKEN", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_ID",
        "WHATSAPP_PHONE_NUMBER_ID", "SMS_PROVIDER", "TELEGRAM_BOT_TOKEN",
        "FILE_SIGNING_KEY", "STORAGE_PROVIDER", "SUPABASE_URL",
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
    _reload_config()


def _set_otherwise_safe_production_env():
    """Every OTHER collect_issues() check satisfied, so a test can assert
    BETA_MODE is the only thing that does/doesn't fire."""
    os.environ["URTRUCK_ENV"] = "production"
    os.environ["TELEGRAM_BOT_TOKEN"] = "safe-telegram-token-value"
    os.environ["FILE_SIGNING_KEY"] = "x" * 32
    os.environ["STORAGE_PROVIDER"] = "s3"
    os.environ["S3_BUCKET"] = "urtruck-prod-bucket"
    os.environ["URTRUCK_ADMIN_PASS"] = "a-genuinely-random-admin-password-9f3"
    os.environ["URTRUCK_API_KEY"] = "a-genuinely-random-api-key-7c1"
    os.environ["URTRUCK_ADMIN_TOKEN"] = "a-genuinely-random-admin-token-4e2"
    os.environ["CORS_ORIGINS"] = "https://urtruck.kz"
    os.environ["REVIEWER_DEMO_CODE"] = "9d4e7a21"
    os.environ.pop("QA_AGENT_TOKEN", None)


# ── layer 1: config.py's own default is safe without any guard involved ──

def test_config_beta_mode_defaults_false_in_production_when_unset(clean_env):
    os.environ["URTRUCK_ENV"] = "production"
    os.environ.pop("BETA_MODE", None)  # operator forgot to set it either way
    config = _reload_config()
    assert config.BETA_MODE is False, (
        "BETA_MODE must default to False when URTRUCK_ENV=production and the "
        "operator never set BETA_MODE explicitly -- a forgotten env var must "
        "never silently enable the universal OTP bypass in production."
    )


def test_config_beta_mode_defaults_true_outside_production_when_unset(clean_env):
    os.environ["URTRUCK_ENV"] = "development"
    os.environ.pop("BETA_MODE", None)
    config = _reload_config()
    assert config.BETA_MODE is True, (
        "dev/preview is intentionally permissive by default (testers log in "
        "with the universal code) -- this must stay true outside production."
    )


# ── layer 2: services/env_check.py -- collect_issues(), isolated ─────────

def test_beta_mode_true_is_flagged_in_production(clean_env):
    os.environ["URTRUCK_ENV"] = "production"
    os.environ["BETA_MODE"] = "true"
    env_check = _reload_env_check()
    issues = env_check.collect_issues()
    assert any(BETA_ISSUE_MARKER in i for i in issues), (
        f"expected a 'BETA_MODE' issue when BETA_MODE=true in production; got: {issues}"
    )


def test_beta_mode_false_is_not_flagged_in_production(clean_env):
    os.environ["URTRUCK_ENV"] = "production"
    os.environ["BETA_MODE"] = "false"
    env_check = _reload_env_check()
    issues = env_check.collect_issues()
    assert not any(BETA_ISSUE_MARKER in i for i in issues), (
        f"an explicit BETA_MODE=false must not be flagged; got: {issues}"
    )


def test_beta_mode_unset_is_not_flagged_in_production(clean_env):
    os.environ["URTRUCK_ENV"] = "production"
    os.environ.pop("BETA_MODE", None)
    env_check = _reload_env_check()
    issues = env_check.collect_issues()
    assert not any(BETA_ISSUE_MARKER in i for i in issues), (
        f"an unset BETA_MODE (relying on config.py's own safe default) must "
        f"not be flagged by this specific check; got: {issues}"
    )


# ── layer 2: enforce_production_env() -- end-to-end, only BETA_MODE varies ─

def test_enforce_production_env_fails_closed_when_beta_mode_forced_on(clean_env):
    _set_otherwise_safe_production_env()
    os.environ["BETA_MODE"] = "true"
    env_check = _reload_env_check()
    with pytest.raises(RuntimeError, match="unsafe configuration"):
        env_check.enforce_production_env()


def test_enforce_production_env_fails_closed_when_beta_mode_forced_on_via_1(clean_env):
    """The truthy-value parser accepts "1"/"true"/"yes" (see config.py /
    env_check.py's `.lower() in ("1", "true", "yes")`) -- pin all three so a
    future refactor that narrows the accepted spellings is caught."""
    _set_otherwise_safe_production_env()
    os.environ["BETA_MODE"] = "1"
    env_check = _reload_env_check()
    with pytest.raises(RuntimeError, match="unsafe configuration"):
        env_check.enforce_production_env()


def test_enforce_production_env_boots_clean_with_beta_mode_false(clean_env):
    _set_otherwise_safe_production_env()
    os.environ["BETA_MODE"] = "false"
    env_check = _reload_env_check()
    env_check.enforce_production_env()  # must not raise


def test_enforce_production_env_boots_clean_with_beta_mode_unset(clean_env):
    """The realistic production deploy path: operator never sets BETA_MODE
    at all, relying on config.py's own default -- must still boot clean."""
    _set_otherwise_safe_production_env()
    os.environ.pop("BETA_MODE", None)
    env_check = _reload_env_check()
    env_check.enforce_production_env()  # must not raise


def test_enforce_production_env_does_not_evaluate_beta_mode_check_outside_production(clean_env):
    os.environ["URTRUCK_ENV"] = "development"
    os.environ["BETA_MODE"] = "true"
    env_check = _reload_env_check()
    env_check.enforce_production_env()  # dev never raises, regardless of config


# ── structural: is_beta_login is still gated on the same BETA_MODE flag ──

def test_registration_beta_login_gate_still_reads_the_guarded_config_flag():
    """Structural guard: api/registration.py's beta-login bypass
    (`is_beta_login`, present in BOTH email_verify and wa_verify) must still
    be gated on `config.BETA_MODE` -- if a future refactor moves it to read
    a raw, unguarded os.getenv("BETA_MODE") directly (bypassing config.py's
    production-safe default), the two boot-time layers above stop being the
    whole story. Verified by reading the actual source, not re-deriving a
    live DB-backed proof.
    """
    import inspect
    from api import registration

    email_verify_src = inspect.getsource(registration.email_verify)
    wa_verify_src = inspect.getsource(registration.wa_verify)
    assert "BETA_MODE and req.code.strip() == BETA_OTP_CODE" in email_verify_src
    assert "BETA_MODE and req.code.strip() == BETA_OTP_CODE" in wa_verify_src


def test_wa_verify_beta_auto_role_no_longer_overwrites_an_existing_client(monkeypatch):
    """The actual role-flip vector this audit found alongside the boot-time
    guards: api/registration.py's wa_verify(), when is_beta_login is true,
    used to auto-assign role="driver" for `driver.get("role") in (None,
    "guest", "client")` -- i.e. it silently flipped an existing CLIENT
    account to driver too, not just a fresh/guest one. email_verify()'s
    equivalent block never included "client" in that tuple; this pins
    wa_verify() to the same, narrower (None, "guest")-only set so a future
    edit cannot reintroduce "client" here without failing this test.
    Structural (source-read), consistent with the file's other checks.
    """
    import inspect
    from api import registration

    wa_verify_src = inspect.getsource(registration.wa_verify)
    assert 'driver.get("role") in (None, "guest")' in wa_verify_src, (
        "wa_verify()'s BETA auto-role-assignment must not include \"client\" in "
        "the set of roles it's allowed to overwrite -- an existing client "
        "account must never be silently flipped to driver via the BETA bypass, "
        "matching email_verify()'s already-narrower (None, \"guest\") behavior."
    )
