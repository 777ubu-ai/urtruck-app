"""Regression tests: централизованная редакция секретов в логах.

Root-cause guard инцидента RC-20260907: ни raw token / authorization /
cookie / secret не должны появляться в logs/errors/telemetry — ни через
redact(), ни через RedactionFilter, ни через исправленные call-sites.
Все значения в тестах синтетические.
"""
import logging
import re
from pathlib import Path

from security.log_redaction import (
    RedactionFilter,
    install_global_redaction,
    redact,
    redact_str,
    token_fingerprint,
)

BACKEND = Path(__file__).resolve().parent.parent


# ---------- redact(): структуры ----------

def test_redact_dict_sensitive_keys_nested():
    payload = {
        "headers": {
            "Authorization": "Bearer synthetic-token-aaaaaaaaaaaaaaaa",
            "Cookie": "session=synthetic-cookie-bbbbbbbbbbbb",
            "X-Api-Key": "synthetic-api-key-cccccccccccc",
            "Content-Type": "application/json",
        },
        "config": {"access_token": "synthetic-tok-dddd", "retries": 3},
        "message": "ok",
    }
    out = redact(payload)
    assert out["headers"]["Authorization"] == "***"
    assert out["headers"]["Cookie"] == "***"
    assert out["headers"]["X-Api-Key"] == "***"
    assert out["config"]["access_token"] == "***"
    # Нечувствительные поля не тронуты:
    assert out["headers"]["Content-Type"] == "application/json"
    assert out["config"]["retries"] == 3
    assert out["message"] == "ok"


def test_redact_list_and_tuple():
    out = redact([{"token": "synthetic-tttt"}, "plain", 42])
    assert out[0]["token"] == "***"
    assert out[1] == "plain"
    assert out[2] == 42


# ---------- redact_str(): паттерны в свободном тексте ----------

def test_redact_str_bearer():
    s = redact_str("auth failed: Bearer synthetictoken.eeeeffff00001111")
    assert "synthetictoken" not in s
    assert "Bearer ***" in s


def test_redact_str_jwt():
    jwt = "eyJ" + "a" * 12 + "." + "b" * 12 + "." + "c" * 8
    assert jwt not in redact_str(f"got {jwt} done")
    assert "<jwt:***>" in redact_str(f"got {jwt} done")


def test_redact_str_expo_push_token():
    s = redact_str("send to ExponentPushToken[syntheticAbCdEfGh1234] failed")
    assert "syntheticAbCdEfGh1234" not in s
    assert "ExponentPushToken[***]" in s


def test_redact_str_telegram_bot_token():
    tg = "123456789:" + "A" * 30
    s = redact_str(f"tg token {tg} revoked")
    assert tg not in s
    assert "<telegram-token:***>" in s


def test_redact_str_openai_key():
    s = redact_str("key sk-synthetictestkey1234567890 expired")
    assert "sk-synthetictestkey1234567890" not in s
    assert "sk-***" in s


# ---------- RedactionFilter: реальные LogRecord ----------

def test_filter_redacts_msg_and_args():
    rec = logging.LogRecord(
        name="t", level=logging.ERROR, pathname=__file__, lineno=1,
        msg="expo ticket error token=%s error=%s",
        args=("ExponentPushToken[syntheticXyZ123456789]", "DeviceNotRegistered"),
        exc_info=None,
    )
    assert RedactionFilter().filter(rec) is True
    formatted = rec.getMessage()
    assert "syntheticXyZ123456789" not in formatted
    assert "ExponentPushToken[***]" in formatted
    assert "DeviceNotRegistered" in formatted


def test_filter_redacts_authorization_header_dump():
    rec = logging.LogRecord(
        name="t", level=logging.INFO, pathname=__file__, lineno=1,
        msg="request headers=%s",
        args=({"Authorization": "Bearer synthetic-zzzzyyyyxxxx", "Accept": "*/*"},),
        exc_info=None,
    )
    RedactionFilter().filter(rec)
    formatted = rec.getMessage()
    assert "synthetic-zzzzyyyyxxxx" not in formatted
    assert "*/*" in formatted


def test_install_global_redaction_idempotent():
    root = logging.getLogger()
    n1 = install_global_redaction()
    total_filters = sum(
        len([f for f in h.filters if isinstance(f, RedactionFilter)])
        for h in root.handlers
    )
    install_global_redaction()
    total_after = sum(
        len([f for f in h.filters if isinstance(f, RedactionFilter)])
        for h in root.handlers
    )
    assert n1 >= 1
    assert total_after == total_filters  # повторная установка не плодит фильтры


# ---------- Статические контракты исправленных call-sites ----------

def test_push_sender_never_logs_raw_or_partial_token():
    src = (BACKEND / "services" / "push_sender.py").read_text(encoding="utf-8")
    assert "tokens[i][:4]" not in src, "first/last-4 маскирование запрещено"
    assert "token_fp=%s" in src, "push_sender обязан логировать fingerprint"
    assert "security.token_guard" in src


def test_telegram_bot_never_prints_token_suffix():
    src = (BACKEND / "services" / "telegram_bot.py").read_text(encoding="utf-8")
    assert "_token[-8:]" not in src, "last-8 токена — частичное раскрытие"
    assert re.search(r"token sha256:", src), "TG-bot обязан печатать fingerprint"


def test_main_installs_redaction_and_revocation_guard():
    src = (BACKEND / "main.py").read_text(encoding="utf-8")
    assert "install_global_redaction()" in src
    assert "assert_config_tokens_not_revoked()" in src


def test_no_raw_secret_logging_patterns_in_services():
    """Запрещаем регресс: log/print с прямой интерполяцией секрета.

    Эвристика ловит f-string/{}/%s печать переменных token/secret/password/
    authorization/cookie БЕЗ fp/redact-маркера рядом (в services и api).
    """
    bad = re.compile(
        r"(log(ger)?\.(debug|info|warning|error|exception)|print)\("
        r"[^#\n]*(\{[^}]*(_token|token|secret|password|authorization|cookie)[^}]*\}"
        r"|%\s*\(?(_token|token|secret|password)\)?\s*[,)])",
        re.IGNORECASE,
    )
    for sub in ("services", "api"):
        for f in (BACKEND / sub).rglob("*.py"):
            for i, line in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
                if "fingerprint" in line or "redact" in line or "_fp" in line:
                    continue  # fingerprint-логирование разрешено
                m = bad.search(line)
                assert not m, (
                    f"{f.relative_to(BACKEND)}:{i} подозрительное логирование "
                    f"секрета: {line.strip()[:120]}"
                )


def test_token_fingerprint_format():
    fp = token_fingerprint("synthetic-value")
    assert re.fullmatch(r"[0-9a-f]{64}", fp)
