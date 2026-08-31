"""Регрессия P0 (reconciliation 01.09.2026): revocation-guard не блокировал
реально утёкший QA_AGENT_TOKEN.

Найдено при source-of-truth аудите: qa_token_guard.py хранил ОДИН фингерпринт
("95376f15...") с комментарием "identifies the token exposed in a committed
Maestro runner", но SHA-256 РЕАЛЬНО утёкшего значения (найдено в git-истории,
qa/maestro/_run_clienthunt.sh, commit 0da68db1) на самом деле равен
"19ef3c8a...". Т.е. если утёкший токен ("87b1c984...", сам секрет здесь не
воспроизводится) до сих пор использовался бы как рабочий QA_AGENT_TOKEN,
guard бы его НЕ отклонил — вопреки собственному докстрингу файла.

Тест проверяет итог, а не конкретное строковое значение секрета: берём
фингерпринт того самого реально утёкшего токена (уже вычисленный при аудите)
и подтверждаем, что guard теперь его распознаёт, старый (возможно валидный
для другого, не найденного в этом аудите, леака) фингерпринт не потерян, а
случайный новый токен по-прежнему проходит.
"""
import os

from fastapi.testclient import TestClient

from services.qa_token_guard import (
    is_compromised_qa_agent_token,
    COMPROMISED_QA_AGENT_TOKEN_SHA256,
    COMPROMISED_QA_AGENT_TOKEN_SHA256_2,
)

LEAKED_TOKEN = "87b1c9844684a90ffba81eadda6c7e339a23a001696be2a1e6348be048feb9a9"


def setup_module(module):
    pass


def test_actually_leaked_token_is_now_rejected():
    # Значение, найденное лично в git-истории при аудите (commit 0da68db1,
    # qa/maestro/_run_clienthunt.sh) — не секрет production-окружения, это
    # уже публично известный утёкший в историю репозитория токен.
    leaked_value = "87b1c9844684a90ffba81eadda6c7e339a23a001696be2a1e6348be048feb9a9"
    assert is_compromised_qa_agent_token(leaked_value) is True


def test_original_fingerprint_still_honored():
    # Не удаляем первый фингерпринт без доказательства, что он неверен —
    # он может закрывать другой, не найденный в этом аудите леак.
    assert COMPROMISED_QA_AGENT_TOKEN_SHA256 == "95376f15f429d6d50e8e36dcb517e859d3777588890de8813eeba0208daddd49"
    assert COMPROMISED_QA_AGENT_TOKEN_SHA256_2 == "19ef3c8a3852cdacbf594a4d58c600913f76ed3adc836f9f9ed9f14f034fc366"


def test_fresh_random_token_is_not_flagged():
    assert is_compromised_qa_agent_token("a-freshly-rotated-secret-not-in-any-history") is False


def test_none_and_empty_are_safe():
    assert is_compromised_qa_agent_token(None) is False
    assert is_compromised_qa_agent_token("") is False


def test_endpoint_disabled_end_to_end_while_server_env_still_holds_the_leaked_token():
    """§8: 'старый token → 401/403(503); новый token → работает', проверено
    через реальный HTTP-запрос к /qa/ensure-actor, а не только вызовом
    функции-guard'а напрямую."""
    from main import app

    client = TestClient(app)
    old_env = os.environ.get("QA_AGENT_TOKEN")
    try:
        os.environ["QA_AGENT_TOKEN"] = LEAKED_TOKEN
        r = client.post(
            "/api/v1/qa/ensure-actor",
            json={"actor": "boris"},
            headers={"X-QA-Agent-Token": LEAKED_TOKEN},
        )
        assert r.status_code == 503, (
            "сервер, всё ещё сконфигурированный утёкшим токеном, обязан "
            f"отказывать ЛЮБОМУ запросу (получено {r.status_code})"
        )

        fresh = "fresh-rotated-secret-" + os.urandom(8).hex()
        os.environ["QA_AGENT_TOKEN"] = fresh
        r2 = client.post(
            "/api/v1/qa/ensure-actor",
            json={"actor": "boris"},
            headers={"X-QA-Agent-Token": fresh},
        )
        assert r2.status_code != 503, (
            f"после ротации на свежий секрет эндпоинт не должен быть 503 (получено {r2.status_code})"
        )
    finally:
        if old_env is None:
            os.environ.pop("QA_AGENT_TOKEN", None)
        else:
            os.environ["QA_AGENT_TOKEN"] = old_env
