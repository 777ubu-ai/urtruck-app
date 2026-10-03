#!/usr/bin/env python3
"""Strict allow-list validator for content-free QA2 diagnostic evidence."""
from __future__ import annotations

import json
import math
import re
import sys
from collections import Counter
from pathlib import Path


_SHA = re.compile(r"^[0-9a-f]{40}$")
_REASON = re.compile(r"^[a-z0-9_]+(?::[a-z0-9_]+)?$")
_CASES = {
    "ru_no_plate_city", "ru_plate_only", "ru_city_only", "ru02_plate_city",
    "zh_no_plate_city", "zh_plate_only", "zh_city_only", "zh02_plate_city",
}
_HISTORIC_CASES = {"ru02_plate_city", "zh02_plate_city"}
_LANGS = {"ru", "zh", "en", "kk"}
_ABORTS = {
    "runtime_mismatch_before_provider_probe",
    "runtime_changed_during_provider_probe",
    "active_database_unavailable",
    "active_database_schema_unavailable",
}

_REQUIRED = {
    "diagnostic_policy": {"kind", "sqlite_mode", "sqlite_query_only", "application_mutation", "application_content_output", "provider_payload_output"},
    "runtime_identity": {"kind", "stage", "expected_source_sha", "backend_source_sha", "ai_source_sha", "status"},
    "active_database": {"kind", "state"},
    "stored_controlled_message": {"kind", "case", "lookup_outcome", "message_id", "created_at", "stored_source_lang", "stored_target_lang", "message_cache", "shared_cache", "historical_reason_codes"},
    "provider_contract_case": {"kind", "case", "attempt", "source_lang_requested", "source_lang_expected", "target_lang_requested", "source_lang_reported", "transport_outcome", "http_status", "safe_error_category", "reason_codes", "identifier_exact", "city_semantic_present", "response_ms", "probe_cache"},
    "reason_code_trace": {"kind", "backend", "mobile", "persistence"},
    "diagnostic_abort": {"kind", "reason"},
}


def _fail(message: str) -> None:
    raise SystemExit(message)


def _exact_keys(row: dict[str, object], kind: str) -> None:
    if set(row) != _REQUIRED[kind]:
        _fail(f"invalid fields for {kind}")


def _string(value: object, allowed: set[str] | None = None) -> str:
    if not isinstance(value, str):
        _fail("expected string")
    if allowed is not None and value not in allowed:
        _fail("unexpected enum value")
    return value


def _finite_latency(value: object) -> None:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
        _fail("latency must be finite and non-negative")


def _reason_codes(value: object) -> None:
    if not isinstance(value, list) or len(value) > 16:
        _fail("invalid reason_codes list")
    if len(set(value)) != len(value) or any(not isinstance(item, str) or not _REASON.fullmatch(item) for item in value):
        _fail("unsafe reason_code")


def _validate_policy(row: dict[str, object]) -> None:
    if row["sqlite_mode"] != "ro" or row["sqlite_query_only"] is not True:
        _fail("read-only SQLite contract missing")
    if row["application_mutation"] != "none" or row["application_content_output"] != "none" or row["provider_payload_output"] != "none":
        _fail("unsafe diagnostic policy")


def _validate_runtime(row: dict[str, object]) -> None:
    _string(row["stage"], {"before", "after"})
    expected = _string(row["expected_source_sha"])
    if not _SHA.fullmatch(expected):
        _fail("invalid expected SHA")
    backend = _string(row["backend_source_sha"])
    ai = _string(row["ai_source_sha"])
    if backend != "UNKNOWN" and not _SHA.fullmatch(backend):
        _fail("invalid backend SHA")
    if ai != "UNKNOWN" and not _SHA.fullmatch(ai):
        _fail("invalid AI SHA")
    status = _string(row["status"], {"matched", "runtime_mismatch"})
    if status == "matched" and (backend != expected or ai != expected):
        _fail("matched runtime must equal expected SHA")
    if status == "runtime_mismatch" and backend == expected and ai == expected:
        _fail("runtime mismatch must identify a mismatch")


def _validate_database(row: dict[str, object]) -> None:
    _string(row["state"], {"active_process_db_path", "service_pid_unavailable", "db_path_not_in_active_process", "active_db_not_regular_file"})


def _validate_stored(row: dict[str, object]) -> None:
    _string(row["case"], _HISTORIC_CASES)
    outcome = _string(row["lookup_outcome"], {"found", "not_found"})
    message_id = row["message_id"]
    if outcome == "found":
        if isinstance(message_id, bool) or not isinstance(message_id, int) or message_id <= 0:
            _fail("found message needs positive numeric ID")
    elif message_id != "UNKNOWN_not_found_in_scoped_cargo_day":
        _fail("not-found message ID must be hidden")
    if row["created_at"] != "REDACTED_TO_CONTROLLED_DAY":
        _fail("unredacted or invalid timestamp")
    _string(row["stored_source_lang"], {"UNKNOWN_not_persisted_for_text"})
    _string(row["stored_target_lang"], {"UNKNOWN_failed_request_not_persisted"})
    _string(row["message_cache"], {"UNKNOWN", "success_row_present", "no_success_row"})
    _string(row["shared_cache"], {"UNKNOWN", "matching_auto_rows_present", "no_matching_auto_rows"})
    _string(row["historical_reason_codes"], {"UNKNOWN_not_persisted_on_failed_translation"})


def _validate_provider(row: dict[str, object]) -> None:
    _string(row["case"], _CASES)
    _string(row["attempt"], {"fresh", "repeat"})
    _string(row["source_lang_requested"], {"auto"})
    _string(row["source_lang_expected"], _LANGS)
    _string(row["target_lang_requested"], _LANGS)
    _string(row["source_lang_reported"], _LANGS | {"UNKNOWN"})
    transport = _string(row["transport_outcome"], {"http", "network_error"})
    status = row["http_status"]
    if transport == "http":
        if isinstance(status, bool) or not isinstance(status, int) or not 100 <= status <= 599:
            _fail("invalid HTTP status")
        _string(row["safe_error_category"], {"none", "http_error"})
    else:
        if status is not None:
            _fail("network error cannot report HTTP status")
        _string(row["safe_error_category"], {"timeout", "url_error", "unknown_network_error"})
    _reason_codes(row["reason_codes"])
    if not isinstance(row["identifier_exact"], bool) or not isinstance(row["city_semantic_present"], bool):
        _fail("provider validators must be booleans")
    _finite_latency(row["response_ms"])
    _string(row["probe_cache"], {"not_applicable_direct_loopback_provider_call"})


def _validate_trace(row: dict[str, object]) -> None:
    if row["backend"] != "LocalAIError_reason_codes_to_HTTP_422_detail":
        _fail("unexpected backend trace")
    if row["mobile"] != "chatAPI_parses_reasonCodes_boolean_only_UI_state":
        _fail("unexpected mobile trace")
    if row["persistence"] != "historical_failed_translation_reason_codes_UNKNOWN":
        _fail("unexpected persistence trace")


def _validate_row(row: object) -> dict[str, object]:
    if not isinstance(row, dict):
        _fail("row must be an object")
    kind = row.get("kind")
    if kind not in _REQUIRED:
        _fail("unknown diagnostic row")
    _exact_keys(row, kind)
    if kind == "diagnostic_policy":
        _validate_policy(row)
    elif kind == "runtime_identity":
        _validate_runtime(row)
    elif kind == "active_database":
        _validate_database(row)
    elif kind == "stored_controlled_message":
        _validate_stored(row)
    elif kind == "provider_contract_case":
        _validate_provider(row)
    elif kind == "reason_code_trace":
        _validate_trace(row)
    else:
        _string(row["reason"], _ABORTS)
    return row


def _validate_complete(rows: list[dict[str, object]]) -> None:
    kinds = Counter(str(row["kind"]) for row in rows)
    expected = {
        "diagnostic_policy": 1,
        "runtime_identity": 2,
        "active_database": 1,
        "stored_controlled_message": 2,
        "provider_contract_case": 16,
        "reason_code_trace": 1,
    }
    if kinds != expected:
        _fail("incomplete or duplicated successful diagnostic artifact")
    runtime = [row for row in rows if row["kind"] == "runtime_identity"]
    if {row["stage"] for row in runtime} != {"before", "after"} or any(row["status"] != "matched" for row in runtime):
        _fail("successful artifact must prove stable matching runtime")
    if len({row["expected_source_sha"] for row in runtime}) != 1:
        _fail("runtime expected SHA changed during diagnostic")
    stored = [row for row in rows if row["kind"] == "stored_controlled_message"]
    if {row["case"] for row in stored} != _HISTORIC_CASES:
        _fail("missing historical controlled case")
    providers = [row for row in rows if row["kind"] == "provider_contract_case"]
    coverage = Counter((str(row["case"]), str(row["attempt"])) for row in providers)
    if set(coverage) != {(case, attempt) for case in _CASES for attempt in {"fresh", "repeat"}} or any(count != 1 for count in coverage.values()):
        _fail("invalid provider case/attempt coverage")


def _validate_abort(rows: list[dict[str, object]]) -> None:
    kinds = Counter(str(row["kind"]) for row in rows)
    if kinds["diagnostic_policy"] != 1 or kinds["diagnostic_abort"] != 1 or kinds["provider_contract_case"] or kinds["reason_code_trace"]:
        _fail("unsafe aborted diagnostic artifact")
    if rows[-1]["kind"] != "diagnostic_abort":
        _fail("abort must be final diagnostic artifact")
    runtimes = [row for row in rows if row["kind"] == "runtime_identity"]
    if not runtimes or len(runtimes) > 2:
        _fail("abort must retain runtime identity evidence")
    if len(runtimes) == 2 and {row["stage"] for row in runtimes} != {"before", "after"}:
        _fail("invalid runtime identity sequence")


def main() -> int:
    if len(sys.argv) != 2:
        _fail("artifact path required")
    try:
        lines = Path(sys.argv[1]).read_text(encoding="utf-8").splitlines()
        rows = [_validate_row(json.loads(line)) for line in lines if line.strip()]
    except (OSError, json.JSONDecodeError) as error:
        _fail(f"invalid diagnostic artifact: {type(error).__name__}")
    if not rows:
        _fail("empty diagnostic artifact")
    if any(row["kind"] == "diagnostic_abort" for row in rows):
        _validate_abort(rows)
    else:
        _validate_complete(rows)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
