"""Regression tests: token-guard (отзыв токенов по sha256-fingerprint).

Инцидент: утечка QA-токена (RC-20260907). Здесь и далее используются ТОЛЬКО
синтетические значения; реальный скомпрометированный токен запрещён в
тестах, логах, отчётах и commit messages — допустимы только fingerprint'ы.
"""
import hashlib
from pathlib import Path

import pytest

from security import token_guard
from security.token_guard import (
    REVOKED_ENV,
    assert_config_tokens_not_revoked,
    assert_not_revoked,
    fingerprint,
    is_revoked,
    revoked_fingerprints,
)

SYNTHETIC_TOKEN = "synthetic-qa-token-0000000000000000000001"
SYNTHETIC_OTHER = "synthetic-qa-token-0000000000000000000002"


def _fp(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


@pytest.fixture(autouse=True)
def _clean_revoked_env(monkeypatch):
    monkeypatch.delenv(REVOKED_ENV, raising=False)


def test_fingerprint_is_sha256_hex():
    assert fingerprint(SYNTHETIC_TOKEN) == _fp(SYNTHETIC_TOKEN)
    assert len(fingerprint(SYNTHETIC_TOKEN)) == 64


def test_revoked_list_parsing(monkeypatch):
    monkeypatch.setenv(REVOKED_ENV, " 9f2AB71c44de ,, 0123abcd56 ")
    assert revoked_fingerprints() == frozenset({"9f2ab71c44de", "0123abcd56"})


def test_revoked_list_rejects_garbage(monkeypatch):
    # Короткие (<8) и не-hex записи игнорируются: кривой prefix не должен
    # ни блокировать легитимные токены, ни давать ложное чувство защиты.
    monkeypatch.setenv(REVOKED_ENV, "abc, zzzzzzzzzzzz, 0123abcd56")
    assert revoked_fingerprints() == frozenset({"0123abcd56"})


def test_empty_revocation_list_is_noop():
    assert revoked_fingerprints() == frozenset()
    assert is_revoked(SYNTHETIC_TOKEN) is False
    assert_not_revoked(SYNTHETIC_TOKEN)  # не бросает


def test_revoked_token_rejected_by_prefix(monkeypatch):
    monkeypatch.setenv(REVOKED_ENV, _fp(SYNTHETIC_TOKEN)[:12])
    assert is_revoked(SYNTHETIC_TOKEN) is True
    assert is_revoked(SYNTHETIC_OTHER) is False
    with pytest.raises(token_guard.HTTPException) as exc:
        assert_not_revoked(SYNTHETIC_TOKEN)
    assert exc.value.status_code == 401
    # В detail не утекает ни сам токен, ни его fingerprint целиком.
    assert SYNTHETIC_TOKEN not in str(exc.value.detail)


def test_config_secret_revoked_fails_closed(monkeypatch):
    secret = "synthetic-config-secret-aaaabbbbccccdddd"
    monkeypatch.setenv("QA_AGENT_TOKEN", secret)
    monkeypatch.setenv(REVOKED_ENV, _fp(secret)[:16])
    with pytest.raises(RuntimeError) as exc:
        assert_config_tokens_not_revoked()
    msg = str(exc.value)
    assert "QA_AGENT_TOKEN" in msg
    assert _fp(secret)[:12] in msg
    assert secret not in msg  # fail-closed не раскрывает сам секрет


def test_config_secret_not_revoked_passes(monkeypatch):
    monkeypatch.setenv("QA_AGENT_TOKEN", "synthetic-config-secret-eeeeffff")
    monkeypatch.setenv(REVOKED_ENV, _fp(SYNTHETIC_TOKEN)[:16])
    assert_config_tokens_not_revoked()  # не бросает


def test_guard_wired_into_registration_auth():
    """Статический контракт: точка верификации Bearer-токена обязана
    вызывать token_guard.assert_not_revoked ДО обращения к DAL."""
    src = Path(__file__).resolve().parent.parent / "api" / "registration.py"
    text = src.read_text(encoding="utf-8")
    guard_pos = text.find("token_guard.assert_not_revoked(token)")
    dal_pos = text.find("reg_dal.get_driver_by_token(token)")
    assert guard_pos != -1, "get_current_driver потерял token-guard"
    assert dal_pos != -1
    assert guard_pos < dal_pos, "token-guard обязан срабатывать до DB lookup"
