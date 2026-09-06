from types import SimpleNamespace

import pytest

from api import auth


def _request(header=None, query=None):
    return SimpleNamespace(
        headers={"X-API-Key": header} if header else {},
        query_params={"api_key": query} if query else {},
    )


def test_production_api_key_ignores_query_parameter(monkeypatch):
    monkeypatch.setattr(auth, "_IS_PROD", True)
    monkeypatch.setattr(auth, "API_KEY", "configured-secret")
    with pytest.raises(auth.HTTPException) as exc:
        auth.require_api_key(_request(query="configured-secret"))
    assert exc.value.status_code == 401
    auth.require_api_key(_request(header="configured-secret"))


def test_development_api_key_query_compatibility_remains(monkeypatch):
    monkeypatch.setattr(auth, "_IS_PROD", False)
    monkeypatch.setattr(auth, "API_KEY", "configured-secret")
    auth.require_api_key(_request(query="configured-secret"))
