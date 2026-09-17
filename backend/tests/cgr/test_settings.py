"""Тесты CGRSettings — раздел 8.5 чеклиста."""
import importlib
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))


@pytest.fixture(autouse=True)
def _clean_cgr_module(monkeypatch):
    """Каждый тест — свежий импорт cgr.settings.

    2026-09-08 harness fix: this used to only delete cgr.settings from
    sys.modules BEFORE each test, never after. api/borders.py does
    `from cgr.settings import cgr_settings` inside its own request handlers
    (api/borders.py:29,196,223) — a live reference to whatever object is
    currently cached in sys.modules["cgr.settings"], re-fetched on every
    request, not frozen at api/borders.py's own import time. The last test
    in this file (test_settings_ok_when_disabled_no_salt) imports
    cgr.settings with CGR_FEATURE_ENABLED=false and never re-imports it —
    that disabled cgr_settings object stayed cached for the rest of the
    pytest session, silently degrading every later test that exercises the
    real borders API (confirmed by bisection: test_border_dashboard.py's
    "best pick"/"free count" assertions failed downstream, order-dependent,
    only when this file ran first). Deleting the cached module in teardown
    too (not just setup) means whoever imports cgr.settings next — a later
    test in this file, or api/borders.py's own next real call — gets a
    fresh import under ITS OWN current (correct, ambient) environment.
    """
    if "cgr.settings" in sys.modules:
        del sys.modules["cgr.settings"]
    # Очистим CGR_* env между тестами
    for k in list(os.environ.keys()):
        if k.startswith("CGR_"):
            monkeypatch.delenv(k, raising=False)
    yield
    if "cgr.settings" in sys.modules:
        del sys.modules["cgr.settings"]


def test_settings_fail_without_iin_salt_when_enabled(monkeypatch):
    monkeypatch.setenv("CGR_FEATURE_ENABLED", "true")
    # CGR_IIN_SALT не задан
    with pytest.raises(ValueError, match="CGR_IIN_SALT is required"):
        importlib.import_module("cgr.settings")


def test_settings_ok_with_iin_salt(monkeypatch):
    monkeypatch.setenv("CGR_FEATURE_ENABLED", "true")
    monkeypatch.setenv("CGR_IIN_SALT", "x" * 64)
    mod = importlib.import_module("cgr.settings")
    assert mod.cgr_settings.iin_salt == "x" * 64
    assert mod.cgr_settings.feature_enabled is True


def test_settings_ok_when_disabled_no_salt(monkeypatch):
    """При FEATURE_ENABLED=false — отсутствие соли НЕ должно валить процесс."""
    monkeypatch.setenv("CGR_FEATURE_ENABLED", "false")
    mod = importlib.import_module("cgr.settings")
    assert mod.cgr_settings.feature_enabled is False
