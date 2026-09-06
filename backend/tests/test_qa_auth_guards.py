"""QA actor provisioning must stay isolated from production auth."""

import pytest
from fastapi import HTTPException

import api.qa as qa


def test_qa_actor_endpoint_requires_non_production(monkeypatch):
    monkeypatch.setattr(qa, "IS_PRODUCTION", True)
    monkeypatch.setenv("QA_AGENT_TOKEN", "configured-but-not-sufficient")

    with pytest.raises(HTTPException) as exc:
        qa._require_agent_token("configured-but-not-sufficient")

    assert exc.value.status_code == 404


def test_qa_actor_endpoint_requires_rotated_explicit_token(monkeypatch):
    monkeypatch.setattr(qa, "IS_PRODUCTION", False)
    monkeypatch.setenv("QA_AGENT_TOKEN", "rotated-qa-secret")

    with pytest.raises(HTTPException) as exc:
        qa._require_agent_token("wrong-token")

    assert exc.value.status_code == 403


def test_qa_actor_endpoint_accepts_explicit_non_production_token(monkeypatch):
    monkeypatch.setattr(qa, "IS_PRODUCTION", False)
    monkeypatch.setenv("QA_AGENT_TOKEN", "rotated-qa-secret")

    qa._require_agent_token("rotated-qa-secret")
