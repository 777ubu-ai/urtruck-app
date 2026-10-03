#!/usr/bin/env python3
"""Read exactly two controlled chat messages and probe QA2 NLLB safely.

The script is streamed to QA2 by the diagnostics-only GitHub workflow.  It
opens SQLite exclusively through ``mode=ro`` and ``PRAGMA query_only=ON``.
It does not print source text, translated text, user identifiers, room IDs,
credentials, or provider payloads.  The eight strings sent to the loopback AI
endpoint are the public controlled regression corpus, not chat data.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
import time
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path


_UUID = re.compile(r"^[0-9a-fA-F-]{36}$")
_DAY = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_SAFE_REASON = re.compile(r"^[a-z0-9_]+(?::[a-z0-9_]+)?$")
_SAFE_HTTP = {200, 400, 408, 413, 422, 429, 500, 502, 503, 504}

# These are the explicitly authorised QA control cases.  Their text is never
# emitted: evidence uses only label, digest, HTTP status and safe validators.
_CASES = (
    ("ru_no_plate_city", "Машина находится здесь.", "ru", "zh", False, False),
    ("ru_plate_only", "Машина A123AA01 находится здесь.", "ru", "zh", True, False),
    ("ru_city_only", "Машина находится в Бахты.", "ru", "zh", False, True),
    ("ru02_plate_city", "Машина A123AA01 находится в Бахты.", "ru", "zh", True, True),
    ("zh_no_plate_city", "卡车现在在这里。", "zh", "ru", False, False),
    ("zh_plate_only", "车牌号为 A123AA01 的卡车现在在这里。", "zh", "ru", True, False),
    ("zh_city_only", "卡车现在在巴克图。", "zh", "ru", False, True),
    ("zh02_plate_city", "车牌号为 A123AA01 的卡车现在在巴克图。", "zh", "ru", True, True),
)


def _digest(value: str) -> str:
    normalized = unicodedata.normalize("NFC", value).strip()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _emit(kind: str, **fields: object) -> None:
    print(json.dumps({"kind": kind, **fields}, ensure_ascii=True, sort_keys=True), flush=True)


def _safe_reasons(detail: object) -> list[str]:
    if not isinstance(detail, dict):
        return []
    values = detail.get("reason_codes") or detail.get("gate_failure_reasons") or []
    if not isinstance(values, list):
        return []
    return [str(value).lower() for value in values if _SAFE_REASON.fullmatch(str(value).lower())]


def _database_candidates() -> list[Path]:
    root = Path("/home/ubuntu/urtruck-qa2")
    return [candidate for candidate in root.rglob("*.db") if candidate.is_file()]


def _safe_message_lookup(cargo_id: str, day: str) -> None:
    wanted_labels = {"ru02_plate_city", "zh02_plate_city"}
    wanted = {
        label: (_digest(text), target)
        for label, text, _source, target, _plate, _city in _CASES
        if label in wanted_labels
    }
    emitted: set[str] = set()
    for candidate in _database_candidates():
        try:
            connection = sqlite3.connect(f"file:{candidate}?mode=ro", uri=True, timeout=2)
            connection.execute("PRAGMA query_only=ON")
            tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            if not {"chat_messages", "chat_rooms"}.issubset(tables):
                connection.close()
                continue
            translation_exists = "chat_translations" in tables
            memory_exists = "translation_memory" in tables
            rows = connection.execute(
                """
                SELECT m.id, m.created_at, m.text
                  FROM chat_messages AS m
                  JOIN chat_rooms AS r ON r.id = m.room_id
                 WHERE r.cargo_id = ?
                   AND COALESCE(m.is_voice, 0) = 0
                   AND substr(COALESCE(m.created_at, ''), 1, 10) = ?
                """,
                (cargo_id, day),
            ).fetchall()
            for message_id, created_at, text in rows:
                digest = _digest(str(text or ""))
                for label, (expected_digest, expected_target) in wanted.items():
                    if digest != expected_digest or label in emitted:
                        continue
                    message_cache = "unknown"
                    if translation_exists:
                        cached = connection.execute(
                            "SELECT 1 FROM chat_translations WHERE message_id=? AND target_lang=? LIMIT 1",
                            (message_id, expected_target),
                        ).fetchone()
                        message_cache = "success_row_present" if cached else "no_success_row"
                    shared_cache = "unknown"
                    if memory_exists:
                        # ``source_lang`` for text messages is not persisted;
                        # the API uses auto detection.  This count deliberately
                        # does not claim that provider/model/prompt identity
                        # matched a lookup.
                        count = connection.execute(
                            "SELECT COUNT(*) FROM translation_memory WHERE source_hash=? AND source_lang='auto' AND target_lang=?",
                            (digest, expected_target),
                        ).fetchone()[0]
                        shared_cache = "matching_auto_rows_%d_lookup_identity_unknown" % count
                    _emit(
                        "stored_controlled_message",
                        case=label,
                        message_id=int(message_id),
                        created_at=str(created_at or "UNKNOWN"),
                        stored_source_lang="UNKNOWN_not_persisted_for_text",
                        stored_target_lang="UNKNOWN_failed_request_not_persisted",
                        message_cache=message_cache,
                        shared_cache=shared_cache,
                        reason_codes="UNKNOWN_not_persisted_on_failed_translation",
                    )
                    emitted.add(label)
            connection.close()
        except (OSError, sqlite3.Error):
            continue
    for label in wanted:
        if label not in emitted:
            _emit("stored_controlled_message", case=label, message_id="UNKNOWN_not_found_in_scoped_cargo_day")


def _call_ai(label: str, text: str, expected_source: str, target: str, wants_plate: bool, wants_city: bool, attempt: str) -> None:
    # /chat/translate sends None for text-message source_lang, so this is the
    # actual production auto-detection path — not a test-only UI-locale hint.
    payload = json.dumps({"text": text, "source_lang": None, "target_lang": target}, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        "http://127.0.0.1:8003/translate", data=payload,
        headers={"Content-Type": "application/json"}, method="POST",
    )
    started = time.monotonic()
    response_payload: object = {}
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            status = int(response.status)
            response_payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        status = int(exc.code)
        try:
            response_payload = json.loads(exc.read().decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            response_payload = {}
    except Exception as exc:  # The exception class is safe operational data.
        status = "network_" + type(exc).__name__.lower()
        response_payload = {}
    latency_ms = round((time.monotonic() - started) * 1000, 2)
    detail = response_payload.get("detail") if isinstance(response_payload, dict) else None
    translated = str(response_payload.get("translated_text") or "") if isinstance(response_payload, dict) else ""
    detected = response_payload.get("source_lang") if isinstance(response_payload, dict) else None
    # The body is intentionally not emitted.  These booleans prove only the
    # exact controlled facts requested by this matrix.
    plate_ok = (translated.count("A123AA01") == 1) if wants_plate and status == 200 else (not wants_plate)
    city_terms = ("巴克图",) if target == "zh" else ("Бахты",)
    city_ok = any(term in translated for term in city_terms) if wants_city and status == 200 else (not wants_city)
    _emit(
        "provider_contract_case",
        case=label,
        attempt=attempt,
        source_lang_requested="auto",
        source_lang_expected=expected_source,
        target_lang_requested=target,
        source_lang_reported=detected if detected in {"ru", "zh", "en", "kk"} else "UNKNOWN",
        http=status if isinstance(status, int) and status in _SAFE_HTTP else "UNKNOWN",
        reason_codes=_safe_reasons(detail),
        identifier_exact=plate_ok,
        city_semantic_present=city_ok,
        response_ms=latency_ms,
        cache_source="fresh_loopback_endpoint_no_application_cache",
    )


def main() -> int:
    cargo_id = os.environ.get("CONTROLLED_CARGO_ID", "")
    day = os.environ.get("CONTROLLED_DAY_UTC", "")
    if not _UUID.fullmatch(cargo_id) or not _DAY.fullmatch(day):
        raise SystemExit("controlled cargo UUID and UTC day are required")
    _emit(
        "diagnostic_policy",
        sqlite_mode="ro",
        sqlite_query_only=True,
        application_mutation="none",
        application_content_output="none",
        provider_payload_output="none",
    )
    _safe_message_lookup(cargo_id, day)
    for label, text, source, target, wants_plate, wants_city in _CASES:
        _call_ai(label, text, source, target, wants_plate, wants_city, "fresh")
        _call_ai(label, text, source, target, wants_plate, wants_city, "repeat")
    _emit(
        "reason_code_trace",
        backend="LocalAIError.reason_codes_to_HTTP_422_detail",
        mobile="chatAPI_parses_reasonCodes_but_DealWorkspaceScreenV2_keeps_boolean_error_only",
        persistence="failed_translation_has_no_chat_translations_row_or_reason_code_column",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
