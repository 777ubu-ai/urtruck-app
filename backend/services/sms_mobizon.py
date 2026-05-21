"""Mobizon SMS provider — production-ready OTP delivery for KZ.

Mobizon (https://mobizon.kz) is the local SMS aggregator we use as
the production OTP fallback when WhatsApp is throttled or the user
is not on WhatsApp. The previous integration was a one-line inline
httpx call inside otp_service.py — Stage 22 lifts it into a proper
module with response-code parsing, retries, configurable endpoint
and sender, and structured error returns.

Configuration (via env, never hard-coded):
    MOBIZON_API_KEY    — required, the API key from
                         https://mobizon.kz → API → Personal cabinet.
                         Stored only in backend/.env on the server,
                         never committed to git.
    MOBIZON_API_URL    — base URL (default: https://api.mobizon.kz).
                         Override only for staging or CIS endpoints.
    MOBIZON_SENDER     — alpha-name / sender id approved in the
                         Mobizon cabinet (e.g. "UrTruck"). Optional —
                         when empty Mobizon picks the default
                         numeric sender for the account.
    MOBIZON_TIMEOUT    — per-request timeout seconds (default 10).

Mobizon response shape (any endpoint):
    {
      "code": 0,                # 0 == OK; non-zero == error
      "data": {...},            # may contain campaignId / messageId
      "message": "Success",
      "messages": []            # optional warnings
    }

We always raise_for_status on the HTTP layer first, then inspect
the inner `code`. Anything non-zero is treated as a delivery
failure (with the Mobizon message preserved for logs).
"""
from __future__ import annotations

import logging
import os
import time
from typing import Any, Dict

import httpx


log = logging.getLogger("urtruck.sms.mobizon")

# Stage 53 (diagnostics): короткий action-tag для логов. Используется
# в строках формата `mobizon rejected action=send_sms ...`, чтобы
# grep'ать в PM2 stdout без необходимости знать полный URL Mobizon.
_SMS_ACTION = "sendsmsmessage"


def _settings() -> Dict[str, str]:
    """Read the env on every call so PM2 reload picks up changes."""
    return {
        "key": os.getenv("MOBIZON_API_KEY", "").strip(),
        "url": (os.getenv("MOBIZON_API_URL") or "https://api.mobizon.kz").rstrip("/"),
        "sender": os.getenv("MOBIZON_SENDER", "").strip(),
        "timeout": float(os.getenv("MOBIZON_TIMEOUT", "10")),
    }


def is_configured() -> bool:
    """True iff a real API key is present. Used by otp_service to
    decide MOCK vs REAL routing."""
    return bool(_settings()["key"])


def _normalize_phone(phone: str) -> str:
    """Mobizon expects MSISDN without `+`, with the country code.
    `+77001234567` → `77001234567`. Anything that's already digits
    passes through unchanged.
    """
    return "".join(ch for ch in phone if ch.isdigit())


def _parse_response(r: httpx.Response) -> Dict[str, Any]:
    """Decode Mobizon's JSON envelope into a flat dict the caller
    can branch on without knowing the wire shape."""
    try:
        body = r.json()
    except ValueError:
        return {
            "ok": False,
            "error": "invalid_json",
            "status_code": r.status_code,
            "raw": r.text[:500],
        }

    code = body.get("code")
    if code == 0:
        data = body.get("data") or {}
        return {
            "ok": True,
            "message_id": data.get("messageId") or data.get("campaignId"),
            "data": data,
        }

    # Non-zero — Mobizon error. Common ones:
    #   100   bad request (e.g. recipient malformed)
    #   101   bad apiKey
    #   202   not enough balance
    #   406   recipient blocked
    #   503   provider rate limit
    #
    # Mobizon ALSO returns code=1 ("Неправильно введены данные…") как
    # обобщённый validation reject — без `messages`/`data` его невозможно
    # диагностировать по PM2-логу. Расширенный лог в send_sms() ниже
    # печатает обе подсказки целиком, поэтому здесь мы только переносим
    # их в dict без преобразований.
    return {
        "ok": False,
        "error": "mobizon_error",
        "code": code,
        "message": body.get("message") or "unknown",
        "messages": body.get("messages") or [],
        "data": body.get("data") or {},
        "status_code": r.status_code,
    }


def send_sms(phone: str, text: str, *, retries: int = 2, backoff_base: float = 0.5) -> Dict[str, Any]:
    """Send an SMS via Mobizon.

    Returns a dict the OTP router treats as:
        sent=True iff Mobizon accepted the message
        plus diagnostic fields (provider, message_id, code, error).

    Never raises. All exceptions/timeouts are caught and surfaced as
    `sent: False` with an `error` key — the caller decides whether
    to fall back to another channel.

    Stage 43B: retries default 2 (3 attempts total), exponential
    backoff (0.5s, 1.0s) between attempts. Network/DNS errors
    (httpx.ConnectError) get retried — they're transient on this VPS
    when systemd-resolved upstream flaps. Mobizon-side errors
    (bad apiKey, no balance, blocked recipient) are returned
    immediately and never retried.
    """
    cfg = _settings()
    if not cfg["key"]:
        return {"sent": False, "channel": "sms", "provider": "mobizon", "error": "not_configured"}

    msisdn = _normalize_phone(phone)
    if len(msisdn) < 10:
        return {"sent": False, "channel": "sms", "provider": "mobizon", "error": "phone_invalid"}

    payload = {
        "apiKey": cfg["key"],
        "recipient": msisdn,
        "text": text,
    }
    if cfg["sender"]:
        payload["from"] = cfg["sender"]

    url = f"{cfg['url']}/service/message/sendsmsmessage"
    last_error: Dict[str, Any] = {}
    masked = _mask_phone(msisdn)
    total_attempts = retries + 1

    def _sleep_before_next(attempt_idx: int) -> None:
        # Backoff before next attempt only — not after the last one.
        if attempt_idx + 1 < total_attempts:
            delay = backoff_base * (2 ** attempt_idx)
            time.sleep(delay)

    for attempt in range(total_attempts):
        try:
            r = httpx.post(url, data=payload, timeout=cfg["timeout"])
        except httpx.ConnectError as e:
            # Includes DNS failures: [Errno -3], [Errno -5]. Worth a retry.
            last_error = {
                "sent": False, "channel": "sms", "provider": "mobizon",
                "error": "connect_error", "detail": str(e)[:200], "attempt": attempt + 1,
            }
            log.warning(
                "mobizon connect/dns phone=%s attempt=%s/%s err=%s",
                masked, attempt + 1, total_attempts, str(e)[:120],
            )
            _sleep_before_next(attempt)
            continue
        except httpx.TimeoutException:
            last_error = {
                "sent": False, "channel": "sms", "provider": "mobizon",
                "error": "timeout", "attempt": attempt + 1,
            }
            log.warning(
                "mobizon timeout phone=%s attempt=%s/%s",
                masked, attempt + 1, total_attempts,
            )
            _sleep_before_next(attempt)
            continue
        except httpx.HTTPError as e:
            last_error = {
                "sent": False, "channel": "sms", "provider": "mobizon",
                "error": "http_error", "detail": str(e)[:200], "attempt": attempt + 1,
            }
            log.warning(
                "mobizon http error phone=%s attempt=%s/%s err=%s",
                masked, attempt + 1, total_attempts, str(e)[:120],
            )
            _sleep_before_next(attempt)
            continue

        if r.status_code >= 500:
            last_error = {
                "sent": False, "channel": "sms", "provider": "mobizon",
                "error": "upstream_5xx", "status_code": r.status_code, "attempt": attempt + 1,
            }
            # Stage 53 (diag): печатаем хвост body на 5xx — Mobizon иногда
            # отдаёт HTML-страницу maintenance / cloudflare-блок, и текст
            # помогает оператору быстро понять причину. apiKey в payload,
            # ответ его не содержит.
            log.warning(
                "mobizon 5xx action=send_sms phone=%s sender=%r endpoint=%s "
                "attempt=%s/%s status=%s body=%r",
                masked, cfg["sender"] or "<default>", _SMS_ACTION,
                attempt + 1, total_attempts, r.status_code, r.text[:300],
            )
            _sleep_before_next(attempt)
            continue

        parsed = _parse_response(r)
        if parsed.get("ok"):
            log.info(
                "mobizon ok phone=%s attempt=%s/%s message_id=%s",
                masked, attempt + 1, total_attempts, parsed.get("message_id"),
            )
            return {
                "sent": True,
                "channel": "sms",
                "provider": "mobizon",
                "message_id": parsed.get("message_id"),
                "attempt": attempt + 1,
            }

        # Non-OK Mobizon — return immediately, do not retry auth/balance errors.
        #
        # Stage 53 (diagnostics-only PR): расширенный warning со всеми
        # полезными полями, чтобы оператор по PM2-логу видел корневую
        # причину отказа без дополнительных запросов к Mobizon UI.
        #
        # Что попадает в лог:
        #   action        — какой эндпоинт дёргали (sendsmsmessage)
        #   phone         — маскированный MSISDN (4 первых ··· 3 последних)
        #   sender        — то, что реально ушло в payload['from']
        #                   (или '<default>' когда MOBIZON_SENDER пустой)
        #   endpoint      — короткий вид URL без apiKey
        #   http_status   — HTTP-код от Mobizon (обычно 200 даже при ошибке
        #                   уровня приложения; полезно отличить от 5xx)
        #   code          — внутренний Mobizon-код (0 = OK, 1 = generic
        #                   validation, 100/101/202/406/503 — известные)
        #   msg           — body.message, краткое описание
        #   messages      — body.messages, per-field validation errors —
        #                   главная новая ценность, тут будут конкретные
        #                   "sender_id is not approved", "recipient is foreign"
        #                   и т.п., которые объясняют code=1
        #   data          — body.data (часть с messageId / campaignId / extras)
        #
        # Что НЕ попадает в лог:
        #   apiKey        — payload в лог не выводим, никогда
        #   полный номер  — только masked (см. _mask_phone)
        log.warning(
            "mobizon rejected action=send_sms phone=%s sender=%r endpoint=%s "
            "attempt=%s/%s http_status=%s code=%s msg=%r messages=%r data=%r",
            masked,
            cfg["sender"] or "<default>",
            _SMS_ACTION,
            attempt + 1,
            total_attempts,
            parsed.get("status_code", r.status_code),
            parsed.get("code"),
            parsed.get("message"),
            parsed.get("messages"),
            parsed.get("data"),
        )
        return {
            "sent": False,
            "channel": "sms",
            "provider": "mobizon",
            "error": parsed.get("error", "mobizon_error"),
            "code": parsed.get("code"),
            "detail": parsed.get("message"),
            "attempt": attempt + 1,
        }

    log.error(
        "mobizon exhausted phone=%s attempts=%s last_error=%s",
        masked, total_attempts, last_error.get("error", "unknown"),
    )
    return last_error or {
        "sent": False, "channel": "sms", "provider": "mobizon", "error": "exhausted",
    }


def _mask_phone(msisdn: str) -> str:
    """Hide the middle digits in logs."""
    if len(msisdn) < 8:
        return msisdn
    return f"{msisdn[:4]}***{msisdn[-3:]}"


def info() -> Dict[str, Any]:
    cfg = _settings()
    return {
        "provider": "mobizon",
        "configured": bool(cfg["key"]),
        "url": cfg["url"],
        "sender": cfg["sender"] or "<default>",
        "mode": "REAL" if cfg["key"] else "MOCK",
    }
