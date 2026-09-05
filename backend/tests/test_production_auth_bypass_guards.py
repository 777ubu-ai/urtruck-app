"""Production-like authentication bypass regression checks."""

import importlib


def test_explicit_beta_mode_cannot_enable_production_bypass(monkeypatch):
    monkeypatch.setenv("URTRUCK_ENV", "production")
    monkeypatch.setenv("BETA_MODE", "true")
    import config
    importlib.reload(config)
    try:
        assert config.IS_PRODUCTION is True
        assert config.BETA_MODE is False
    finally:
        importlib.reload(config)


def test_reviewer_override_cannot_enable_production_bypass(monkeypatch):
    monkeypatch.setenv("URTRUCK_ENV", "production")
    monkeypatch.setenv("REVIEWER_DEMO_CODE", "owner-supplied-code")
    import config
    importlib.reload(config)
    try:
        assert config.IS_PRODUCTION is True
        assert config.REVIEWER_DEMO_CODE_IS_DEFAULT is False
        reviewer_allowed = not config.IS_PRODUCTION
        assert reviewer_allowed is False
    finally:
        importlib.reload(config)
