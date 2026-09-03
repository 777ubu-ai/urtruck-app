import importlib
import tempfile
from pathlib import Path


def _reload_storage(monkeypatch, **env):
    for key in ("URTRUCK_ENV", "ENV", "APP_ENV", "STORAGE_LOCAL_ROOT"):
        monkeypatch.delenv(key, raising=False)
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    from services import storage_service
    return importlib.reload(storage_service)


def test_storage_default_root_uses_approved_runtime_env_aliases(monkeypatch):
    storage = _reload_storage(monkeypatch, ENV="development")
    assert storage.LOCAL_ROOT == Path(tempfile.gettempdir()) / "urtruck-storage"
    assert storage._PROD is False


def test_urtruck_env_development_uses_local_tmp_root(monkeypatch):
    storage = _reload_storage(monkeypatch, URTRUCK_ENV="development")

    assert storage.LOCAL_ROOT == Path(tempfile.gettempdir()) / "urtruck-storage"
    assert storage._PROD is False


def test_urtruck_env_test_uses_local_tmp_root(monkeypatch):
    storage = _reload_storage(monkeypatch, URTRUCK_ENV="test")

    assert storage.LOCAL_ROOT == Path(tempfile.gettempdir()) / "urtruck-storage"
    assert storage._PROD is False


def test_urtruck_env_production_uses_production_root(monkeypatch):
    storage = _reload_storage(monkeypatch, URTRUCK_ENV="production")

    assert storage.LOCAL_ROOT == Path("/home/ubuntu/urtruck-security/storage")
    assert storage._PROD is True


def test_app_env_alone_is_risk_only_not_production_guard_source(monkeypatch):
    storage = _reload_storage(monkeypatch, APP_ENV="development")

    assert storage.LOCAL_ROOT == Path("/home/ubuntu/urtruck-security/storage")
    assert storage._PROD is True
