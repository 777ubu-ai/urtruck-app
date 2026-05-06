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
from typing import Any, Dict

import httpx


log = logging.getLogger("urtruck.sms.mobizon")


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
        return {"ok": False, "error": "invalid_json", "status_code": r.status_code, "raw": r.text[:500]}

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
    return {
        "ok": False,
        "error": "mobizon_error",
        "code": code,
        "message": body.get("message") or "unknown",
        "messages": body.get("messages") or [],
    }


def send_sms(phone: str, text: str, *, retries: int = 1) -> Dict[str, Any]:
    """Send an SMS via Mobizon.

    Returns a dict the OTP router treats as:
        sent=True iff Mobizon accepted the message
        plus diagnostic fields (provider, message_id, code, error).

    Never raises. All exceptions/timeouts are caught and surfaced as
    `sent: False` with an `error` key — the caller decides whether
    to fall back to another channel.
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

    # `retries=1` means one retry after a transient network error
    # (timeout / connection reset). Mobizon-side errors (auth, balance)
    # are NOT retried — the response gets returned immediately.
    for attempt in range(retries + 1):
        try:
            r = httpx.post(url, data=payload, timeout=cfg["timeout"])
        except httpx.TimeoutException:
            last_error = {"sent": False, "channel": "sms", "provider": "mobizon", "error": "timeout", "attempt": attempt + 1}
            log.warning("mobizon timeout phone=%s attempt=%s", _mask_phone(msisdn), attempt + 1)
            continue
        except httpx.HTTPError as e:
            last_error = {"sent": False, "channel": "sms", "provider": "mobizon", "error": "http_error", "detail": str(e)[:200]}
            log.warning("mobizon http error phone=%s err=%s", _mask_phone(msisdn), str(e)[:120])
            continue

        if r.status_code >= 500:
            last_error = {"sent": False, "channel": "sms", "provider": "mobizon", "error": "upstream_5xx", "status_code": r.status_code}
            log.warning("mobizon 5xx phone=%s status=%s", _mask_phone(msisdn), r.status_code)
            continue

        parsed = _parse_response(r)
        if parsed.get("ok"):
            log.info("mobizon ok phone=%s message_id=%s", _mask_phone(msisdn), parsed.get("message_id"))
            return {
                "sent": True,
                "channel": "sms",
                "provider": "mobizon",
                "message_id": parsed.get("message_id"),
            }

        # Non-OK Mobizon — return immediately, do not retry auth/balance errors.
        log.warning(
            "mobizon rejected phone=%s code=%s msg=%s",
            _mask_phone(msisdn),
            parsed.get("code"),
            parsed.get("message"),
        )
        return {
            "sent": False,
            "channel": "sms",
            "provider": "mobizon",
            "error": parsed.get("error", "mobizon_error"),
            "code": parsed.get("code"),
            "detail": parsed.get("message"),
        }

    return last_error or {"sent": False, "channel": "sms", "provider": "mobizon", "error": "exhausted"}


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
