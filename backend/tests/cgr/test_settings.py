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

    Чистим модуль и ДО, и ПОСЛЕ теста. Без post-cleanup эти тесты отравляли
    весь остальной сюит: `cgr.settings.cgr_settings` — модульный singleton,
    построенный в момент импорта. Тест «disabled без соли» импортировал модуль
    при CGR_FEATURE_ENABLED=false и ОСТАВЛЯЛ его в sys.modules;
    monkeypatch возвращал env, но не объект. Дальше `api/borders._cgr_enabled()`
    видел feature_enabled=False и уходил в legacy-ветку — из-за этого
    test_border_dashboard в полном прогоне получал has_live_data=False,
    free=0 и best=None (в одиночку — зелёный).
    """
    def _drop():
        sys.modules.pop("cgr.settings", None)

    _drop()
    # Очистим CGR_* env между тестами
    for k in list(os.environ.keys()):
        if k.startswith("CGR_"):
            monkeypatch.delenv(k, raising=False)
    yield
    # Следующий импортёр обязан пересобрать singleton из восстановленного env.
    _drop()


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
