"""Тесты CGRSettings — раздел 8.5 чеклиста."""
import importlib
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))


@pytest.fixture(autouse=True)
def _clean_cgr_module(monkeypatch):
    """Каждый тест — свежий импорт cgr.settings."""
    if "cgr.settings" in sys.modules:
        del sys.modules["cgr.settings"]
    # Очистим CGR_* env между тестами
    for k in list(os.environ.keys()):
        if k.startswith("CGR_"):
            monkeypatch.delenv(k, raising=False)


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
