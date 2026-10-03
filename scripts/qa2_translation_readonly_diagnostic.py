#!/usr/bin/env python3
"""Collect a bounded, content-free QA2 translation diagnostic artifact.

This helper is streamed by a diagnostics-only workflow.  It never changes QA2:
the active SQLite database is opened through ``mode=ro`` and ``PRAGMA
query_only=ON``; all database statements are SELECT/PRAGMA.  It deliberately
keeps historic failed-message reasons separate from new direct NLLB probes.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
import subprocess
import time
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path


_UUID = re.compile(r"^[0-9a-fA-F-]{36}$")
_DAY = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_SHA = re.compile(r"^[0-9a-f]{40}$")
_SAFE_REASON = re.compile(r"^[a-z0-9_]+(?::[a-z0-9_]+)?$")

# Public controlled corpus; source and provider response text are never emitted.
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


def _safe_sha(value: object) -> str:
    candidate = str(value or "").lower()
    return candidate if _SHA.fullmatch(candidate) else "UNKNOWN"


def _safe_reasons(detail: object) -> list[str]:
    if not isinstance(detail, dict):
        return []
    values = detail.get("reason_codes") or detail.get("gate_failure_reasons") or []
    if not isinstance(values, list):
        return []
    return sorted({str(value).lower() for value in values if _SAFE_REASON.fullmatch(str(value).lower())})[:16]


def _safe_latency(started: float) -> float:
    value = round((time.monotonic() - started) * 1000, 2)
    return value if value >= 0 else 0.0


def _health_source_sha(port: int) -> str:
    request = urllib.request.Request(f"http://127.0.0.1:{port}/health", method="GET")
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return "UNKNOWN"
    return _safe_sha(payload.get("source_sha") if isinstance(payload, dict) else None)


def _service_pid(unit: str) -> int | None:
    try:
        command = subprocess.run(
            ["systemctl", "show", unit, "-p", "MainPID", "--value"],
            check=False,
            capture_output=True,
            text=True,
            timeout=5,
        )
        pid = int(command.stdout.strip())
        return pid if pid > 0 else None
    except (ValueError, subprocess.SubprocessError):
        return None


def _service_source_sha(unit: str, marker_relative_to_cwd: str) -> str:
    """Read the deployed marker adjacent to the live service process only."""
    pid = _service_pid(unit)
    if pid is None:
        return "UNKNOWN"
    try:
        return _safe_sha((Path(f"/proc/{pid}/cwd") / marker_relative_to_cwd).read_text(encoding="utf-8").strip())
    except OSError:
        return "UNKNOWN"


def _runtime_identity(expected_sha: str, stage: str) -> bool:
    backend_sha = _service_source_sha("urtruck-qa2.service", ".qa-source-sha")
    # The AI unit's fixed WorkingDirectory is "$QA_AI_ROOT/app", while its
    # deploy marker is fixed at "$QA_AI_ROOT/.qa-source-sha".
    ai_marker_sha = _service_source_sha("urtruck-qa2-ai.service", "../.qa-source-sha")
    ai_health_sha = _health_source_sha(8003)
    ai_sha = ai_marker_sha if ai_marker_sha == ai_health_sha else "UNKNOWN"
    matched = backend_sha == expected_sha and ai_sha == expected_sha
    _emit(
        "runtime_identity",
        stage=stage,
        expected_source_sha=expected_sha,
        backend_source_sha=backend_sha,
        ai_source_sha=ai_sha,
        status="matched" if matched else "runtime_mismatch",
    )
    return matched


def _active_database() -> tuple[Path | None, str]:
    """Resolve DB_PATH from the active service process; never scan directories."""
    pid = _service_pid("urtruck-qa2.service")
    if pid is None:
        return None, "service_pid_unavailable"
    try:
        environment = Path(f"/proc/{pid}/environ").read_bytes().split(b"\0")
    except OSError:
        return None, "service_pid_unavailable"
    db_value = next((entry[8:] for entry in environment if entry.startswith(b"DB_PATH=")), None)
    if not db_value:
        return None, "db_path_not_in_active_process"
    try:
        candidate = Path(os.fsdecode(db_value)).resolve(strict=True)
    except OSError:
        return None, "active_db_not_regular_file"
    if not candidate.is_file():
        return None, "active_db_not_regular_file"
    return candidate, "active_process_db_path"


def _stored_messages(database: Path, cargo_id: str, day: str) -> None:
    wanted = {
        label: (_digest(text), target)
        for label, text, _source, target, _plate, _city in _CASES
        if label in {"ru02_plate_city", "zh02_plate_city"}
    }
    found: set[str] = set()
    # `mode=ro` and query_only are both intentional defense-in-depth controls.
    connection = sqlite3.connect(f"file:{database}?mode=ro", uri=True, timeout=2)
    try:
        connection.execute("PRAGMA query_only=ON")
        tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if not {"chat_messages", "chat_rooms"}.issubset(tables):
            raise sqlite3.DatabaseError("controlled tables unavailable")
        translation_exists = "chat_translations" in tables
        memory_exists = "translation_memory" in tables
        rows = connection.execute(
            """
            SELECT m.id, m.text
              FROM chat_messages AS m
              JOIN chat_rooms AS r ON r.id = m.room_id
             WHERE r.cargo_id = ?
               AND COALESCE(m.is_voice, 0) = 0
               AND substr(COALESCE(m.created_at, ''), 1, 10) = ?
            """,
            (cargo_id, day),
        ).fetchall()
        for message_id, text in rows:
            digest = _digest(str(text or ""))
            for label, (expected_digest, target) in wanted.items():
                if label in found or digest != expected_digest:
                    continue
                message_cache = "UNKNOWN"
                if translation_exists:
                    cached = connection.execute(
                        "SELECT 1 FROM chat_translations WHERE message_id=? AND target_lang=? LIMIT 1",
                        (message_id, target),
                    ).fetchone()
                    message_cache = "success_row_present" if cached else "no_success_row"
                shared_cache = "UNKNOWN"
                if memory_exists:
                    cached = connection.execute(
                        "SELECT 1 FROM translation_memory WHERE source_hash=? AND source_lang='auto' AND target_lang=? LIMIT 1",
                        (digest, target),
                    ).fetchone()
                    shared_cache = "matching_auto_rows_present" if cached else "no_matching_auto_rows"
                _emit(
                    "stored_controlled_message",
                    case=label,
                    lookup_outcome="found",
                    message_id=int(message_id),
                    created_at="REDACTED_TO_CONTROLLED_DAY",
                    stored_source_lang="UNKNOWN_not_persisted_for_text",
                    stored_target_lang="UNKNOWN_failed_request_not_persisted",
                    message_cache=message_cache,
                    shared_cache=shared_cache,
                    historical_reason_codes="UNKNOWN_not_persisted_on_failed_translation",
                )
                found.add(label)
    finally:
        connection.close()
    for label in wanted:
        if label not in found:
            _emit(
                "stored_controlled_message",
                case=label,
                lookup_outcome="not_found",
                message_id="UNKNOWN_not_found_in_scoped_cargo_day",
                created_at="REDACTED_TO_CONTROLLED_DAY",
                stored_source_lang="UNKNOWN_not_persisted_for_text",
                stored_target_lang="UNKNOWN_failed_request_not_persisted",
                message_cache="UNKNOWN",
                shared_cache="UNKNOWN",
                historical_reason_codes="UNKNOWN_not_persisted_on_failed_translation",
            )


def _provider_probe(case: tuple[str, str, str, str, bool, bool], attempt: str) -> dict[str, object]:
    label, text, expected_source, target, wants_plate, wants_city = case
    payload = json.dumps({"text": text, "source_lang": None, "target_lang": target}, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        "http://127.0.0.1:8003/translate", data=payload,
        headers={"Content-Type": "application/json"}, method="POST",
    )
    started = time.monotonic()
    response_payload: object = {}
    transport = "http"
    status: int | None = None
    error_category = "none"
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            status = int(response.status)
            response_payload = json.loads(response.read().decode("utf-8"))
            if status >= 400:
                error_category = "http_error"
    except urllib.error.HTTPError as exc:
        status = int(exc.code)
        error_category = "http_error"
        try:
            response_payload = json.loads(exc.read().decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            response_payload = {}
    except TimeoutError:
        transport = "network_error"
        error_category = "timeout"
    except urllib.error.URLError:
        transport = "network_error"
        error_category = "url_error"
    except OSError:
        transport = "network_error"
        error_category = "unknown_network_error"
    latency_ms = _safe_latency(started)
    detail = response_payload.get("detail") if isinstance(response_payload, dict) else None
    translated = str(response_payload.get("translated_text") or "") if isinstance(response_payload, dict) else ""
    detected = response_payload.get("source_lang") if isinstance(response_payload, dict) else None
    return {
        "kind": "provider_contract_case",
        "case": label,
        "attempt": attempt,
        "source_lang_requested": "auto",
        "source_lang_expected": expected_source,
        "target_lang_requested": target,
        "source_lang_reported": detected if detected in {"ru", "zh", "en", "kk"} else "UNKNOWN",
        "transport_outcome": transport,
        "http_status": status if isinstance(status, int) and 100 <= status <= 599 else None,
        "safe_error_category": error_category,
        "reason_codes": _safe_reasons(detail),
        "identifier_exact": (translated.count("A123AA01") == 1) if wants_plate and status == 200 else not wants_plate,
        "city_semantic_present": ("巴克图" in translated) if wants_city and target == "zh" and status == 200 else (("Бахты" in translated) if wants_city and target == "ru" and status == 200 else not wants_city),
        "response_ms": latency_ms,
        "probe_cache": "not_applicable_direct_loopback_provider_call",
    }


def main() -> int:
    cargo_id = os.environ.get("CONTROLLED_CARGO_ID", "")
    day = os.environ.get("CONTROLLED_DAY_UTC", "")
    expected_sha = os.environ.get("QA_SOURCE_SHA", "").lower()
    if not _UUID.fullmatch(cargo_id) or not _DAY.fullmatch(day) or not _SHA.fullmatch(expected_sha):
        raise SystemExit("controlled cargo UUID, UTC day and exact expected source SHA are required")
    _emit(
        "diagnostic_policy",
        sqlite_mode="ro",
        sqlite_query_only=True,
        application_mutation="none",
        application_content_output="none",
        provider_payload_output="none",
    )
    if not _runtime_identity(expected_sha, "before"):
        _emit("diagnostic_abort", reason="runtime_mismatch_before_provider_probe")
        return 0
    database, database_state = _active_database()
    _emit("active_database", state=database_state)
    if database is None:
        _emit("diagnostic_abort", reason="active_database_unavailable")
        return 0
    try:
        _stored_messages(database, cargo_id, day)
    except sqlite3.Error:
        _emit("diagnostic_abort", reason="active_database_schema_unavailable")
        return 0
    results = [_provider_probe(case, attempt) for case in _CASES for attempt in ("fresh", "repeat")]
    if not _runtime_identity(expected_sha, "after"):
        _emit("diagnostic_abort", reason="runtime_changed_during_provider_probe")
        return 0
    for result in results:
        _emit("provider_contract_case", **{key: value for key, value in result.items() if key != "kind"})
    _emit(
        "reason_code_trace",
        backend="LocalAIError_reason_codes_to_HTTP_422_detail",
        mobile="chatAPI_parses_reasonCodes_boolean_only_UI_state",
        persistence="historical_failed_translation_reason_codes_UNKNOWN",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
