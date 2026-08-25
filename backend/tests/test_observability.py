"""Тесты observability: health/ready, correlation ID, storage delete (Issue #288).

Проверяем:
- /health и /health/ready отвечают корректно
- Correlation ID пробрасывается в ответ
- storage_service.delete_object работает для local-файлов
"""
import os
import sys
import tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_observability.db")
os.environ.setdefault("ENV", "test")

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_health_liveness():
    """Liveness probe: /health всегда 200."""
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_health_ready():
    """/health/ready проверяет зависимости и включает version."""
    r = client.get("/health/ready")
    data = r.json()
    assert data["status"] in ("ready", "degraded")
    assert "version" in data
    assert "checks" in data
    assert "sqlite" in data["checks"]


def test_correlation_id_generated():
    """Без входного X-Request-Id сервер генерирует свой."""
    r = client.get("/health")
    cid = r.headers.get("x-request-id")
    assert cid is not None
    assert len(cid) == 12


def test_correlation_id_passthrough():
    """Входной X-Request-Id пробрасывается в ответ."""
    r = client.get("/health", headers={"X-Request-Id": "test-cid-abc"})
    assert r.headers.get("x-request-id") == "test-cid-abc"


def test_system_info_includes_version():
    """/api/v1/system/info теперь включает version."""
    r = client.get("/api/v1/system/info")
    assert r.status_code == 200
    assert "version" in r.json()


def test_storage_delete_local_file():
    """storage_service.delete_object удаляет локальный файл."""
    from services import storage_service

    # Создать временный файл в LOCAL_ROOT
    test_dir = storage_service.LOCAL_ROOT / "test-del"
    test_dir.mkdir(parents=True, exist_ok=True)
    test_file = test_dir / "dummy.jpg"
    test_file.write_bytes(b"fake image data")

    ref = f"{storage_service.LOCAL_PUBLIC_BASE}/test-del/dummy.jpg"
    assert test_file.exists()

    result = storage_service.delete_object(ref)
    assert result is True
    assert not test_file.exists()


def test_storage_delete_nonexistent():
    """delete_object на несуществующий файл — не падает, возвращает True (missing_ok)."""
    from services import storage_service
    ref = f"{storage_service.LOCAL_PUBLIC_BASE}/nonexistent/nope.jpg"
    result = storage_service.delete_object(ref)
    assert result is True  # missing_ok=True


def test_storage_delete_empty():
    """delete_object(None) / delete_object('') → False."""
    from services import storage_service
    assert storage_service.delete_object(None) is False
    assert storage_service.delete_object("") is False
