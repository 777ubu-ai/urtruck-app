#!/usr/bin/env python3
"""Safe-by-default QA2 local-AI translation diagnostics.

This runner sends only the synthetic logistics corpus below to the loopback
local-AI endpoint.  It has no application-data, database, or media inputs.
It neither changes QA2 nor downloads models.  Every output line is JSON.
"""

from __future__ import annotations

import json
import os
import re
import resource
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

AI_ROOT = Path(os.getenv("QA2_AI_ROOT", "/home/ubuntu/urtruck-qa2-ai"))
AI_URL = os.getenv("QA2_AI_URL", "http://127.0.0.1:8003").rstrip("/")

# Public, synthetic logistics texts.  Each direction exercises price/currency,
# weight, cities, body type, negation, date, and a short reply.
LANG_TEXT = {
    "ru": {
        "cargo": "Алматы — Астана: груз 1500 USD, 10 тонн, тент.",
        "negation": "Не рефрижератор: нужен тент, 20 тонн.",
        "schedule": "Урумчи, склад, 09:30, дата 2026-10-01.",
        "price": "Цена 12 000 USD, вес 15 тонн.",
        "short": "Да, груз готов.",
    },
    "zh": {
        "cargo": "阿拉木图—阿斯塔纳：货物1500美元，10吨，篷布车。",
        "negation": "不是冷藏车：需要篷布车，20吨。",
        "schedule": "乌鲁木齐，仓库，09:30，日期2026-10-01。",
        "price": "价格12000美元，重量15吨。",
        "short": "好的，货物已准备好。",
    },
    "en": {
        "cargo": "Almaty to Astana: cargo 1500 USD, 10 tonnes, tent truck.",
        "negation": "Not a refrigerated truck: a tent truck is required, 20 tonnes.",
        "schedule": "Urumqi, warehouse, 09:30, date 2026-10-01.",
        "price": "Price 12,000 USD, weight 15 tonnes.",
        "short": "Yes, the cargo is ready.",
    },
}
PAIRS = (("ru", "zh"), ("zh", "ru"), ("ru", "en"), ("en", "ru"), ("en", "zh"), ("zh", "en"))
REQUIRED_FACTS = {
    "cargo": ("money_1500_usd", "weight_10", "city_almaty", "city_astana", "tent"),
    "negation": ("not_refrigerated", "tent", "weight_20"),
    "schedule": ("city_urumqi", "warehouse", "time_0930", "date_2026_10_01"),
    "price": ("money_12000_usd", "weight_15"),
    "short": ("cargo_ready",),
}

FACT_PATTERNS = {
    "ru": {
        "money_1500_usd": (r"1500\s*(?:usd|доллар(?:ов|а)?\s*сша|долл?\.?\s*сша)",),
        "money_12000_usd": (r"12[\s,]?000\s*(?:usd|доллар(?:ов|а)?\s*сша|долл?\.?\s*сша)",),
        "weight_10": (r"10\s*(?:тонн\w*|т\b)",), "weight_15": (r"15\s*(?:тонн\w*|т\b)",),
        "weight_20": (r"20\s*(?:тонн\w*|т\b)",), "city_almaty": (r"алматы",),
        "city_astana": (r"астана",), "city_urumqi": (r"урумчи",), "warehouse": (r"склад",), "tent": (r"тент(?:ов\w*)?",),
        "not_refrigerated": (r"не\s+(?:нужен\s+)?рефриж",), "time_0930": (r"09\s*:\s*30",),
        "date_2026_10_01": (r"2026[-/.]10[-/.]0?1",), "refrigerated": (r"рефриж",),
        "positive_refrigerated": (r"(?:нужен|требуется)\s+(?:рефриж\w*)",),
        "not_tent": (r"не\s+тент(?:ов\w*)?", r"тент(?:ов\w*)?(?:\s+тоже)?\s+не\s+нужен"), "cargo_ready": (r"груз\s+(?:готов|готовый)",),
        "not_cargo_ready": (r"груз\s+не\s+готов", r"груз\s+готов\s*\?\s*нет"),
    },
    "en": {
        "money_1500_usd": (r"1500\s*(?:usd|us\s*dollars?)",),
        "money_12000_usd": (r"12[\s,]?000\s*(?:usd|us\s*dollars?)",),
        "weight_10": (r"10\s*(?:tonnes?|tons?)",), "weight_15": (r"15\s*(?:tonnes?|tons?)",),
        "weight_20": (r"20\s*(?:tonnes?|tons?)",), "city_almaty": (r"almaty",),
        "city_astana": (r"astana",), "city_urumqi": (r"urumqi",), "warehouse": (r"warehouse",),
        "tent": (r"(?:tent|curtain[ -]sided)\s*(?:truck|trailer)?",),
        "not_refrigerated": (r"not\s+(?:a\s+)?(?:refrigerated|reefer)",),
        "time_0930": (r"09\s*:\s*30",), "date_2026_10_01": (r"2026[-/.]10[-/.]0?1",),
        "refrigerated": (r"(?:refrigerated|reefer)",),
        "positive_refrigerated": (r"(?:need|requires?)\s+(?:a\s+)?(?:refrigerated|reefer)", r"(?:a\s+)?(?:refrigerated|reefer)\s+(?:truck\s+)?is\s+required"),
        "not_tent": (r"not\s+(?:a\s+)?(?:tent|curtain[ -]sided)\s*(?:truck|trailer)?", r"(?:tent|curtain[ -]sided)\s*(?:truck|trailer)?\s+(?:is\s+)?(?:also\s+)?not\s+needed"),
        "cargo_ready": (r"cargo\s+is\s+ready", r"goods\s+are\s+ready"), "not_cargo_ready": (r"cargo\s+(?:is\s+)?not\s+ready", r"goods\s+are\s+not\s+ready", r"cargo\s+(?:is\s+)?ready\s*\?\s*no"),
    },
    "zh": {
        "money_1500_usd": (r"1500\s*(?:usd|美元)",), "money_12000_usd": (r"12000\s*(?:usd|美元)",),
        "weight_10": (r"10\s*吨",), "weight_15": (r"15\s*吨",), "weight_20": (r"20\s*吨",),
        "city_almaty": (r"阿拉木图",), "city_astana": (r"阿斯塔纳",), "city_urumqi": (r"乌鲁木齐",), "warehouse": (r"仓库",),
        "tent": (r"(?:篷布车|篷车|帆布车)",), "not_refrigerated": (r"(?:不[是要]?|非)\s*冷藏车",),
        "time_0930": (r"09\s*[:：]\s*30",), "date_2026_10_01": (r"2026(?:[-/.]10[-/.]0?1|年10月0?1日?)",),
        "refrigerated": (r"冷藏车",), "positive_refrigerated": (r"(?:需要|要)\s*冷藏车",),
        "not_tent": (r"(?:不[是要]?|非)\s*(?:篷布车|篷车|帆布车)", r"(?:篷布车|篷车|帆布车)也?不需要"),
        "cargo_ready": (r"货物(?:已)?准备好",), "not_cargo_ready": (r"货物(?:还)?没(?:有)?准备好", r"货物准备好了吗?\s*[？?]?\s*不"),
    },
}
FORBIDDEN_BODY = {"ru": ("водопад",), "en": ("waterfall",), "zh": ("瀑布",)}


def emit(kind: str, **values: object) -> None:
    print(json.dumps({"kind": kind, **values}, ensure_ascii=False), flush=True)


def require_loopback_url() -> None:
    parsed = urlparse(AI_URL)
    if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost"}:
        raise SystemExit("QA2_AI_URL must be an http loopback endpoint")


def rss_bytes() -> int | None:
    try:
        for line in Path("/proc/self/status").read_text().splitlines():
            if line.startswith("VmRSS:"):
                return int(line.split()[1]) * 1024
    except (OSError, ValueError):
        return None
    return None


def snapshot(label: str) -> None:
    usage = resource.getrusage(resource.RUSAGE_SELF)
    try:
        load = os.getloadavg()
    except OSError:
        load = (None, None, None)
    emit(
        "resource",
        label=label,
        rss_bytes=rss_bytes(),
        cpu_user_ms=round(usage.ru_utime * 1000, 2),
        cpu_system_ms=round(usage.ru_stime * 1000, 2),
        load_1m=round(load[0], 3) if load[0] is not None else None,
        load_5m=round(load[1], 3) if load[1] is not None else None,
        load_15m=round(load[2], 3) if load[2] is not None else None,
    )


def post_translate(text: str, source: str, target: str) -> tuple[int | None, dict, float]:
    request = urllib.request.Request(
        f"{AI_URL}/translate",
        data=json.dumps({"text": text, "source_lang": source, "target_lang": target}, ensure_ascii=False).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(request, timeout=240) as response:
            return response.status, json.loads(response.read().decode()), round((time.perf_counter() - started) * 1000, 2)
    except urllib.error.HTTPError as exc:
        try:
            payload = json.loads(exc.read().decode())
        except (json.JSONDecodeError, UnicodeDecodeError):
            payload = {"detail": type(exc).__name__}
        return exc.code, payload, round((time.perf_counter() - started) * 1000, 2)
    except Exception as exc:  # Safe diagnostic must finish even if local AI is down.
        return None, {"detail": type(exc).__name__}, round((time.perf_counter() - started) * 1000, 2)


def semantic_check(target: str, key: str, translated: str | None) -> tuple[bool, list[str], list[str]]:
    """Check structured cargo facts, including the required negation relation."""
    required = REQUIRED_FACTS[key]
    if not translated:
        return False, list(required), []
    patterns = FACT_PATTERNS[target]
    missing = [fact for fact in required if not any(re.search(pattern, translated, re.IGNORECASE) for pattern in patterns[fact])]
    forbidden = [term for term in FORBIDDEN_BODY[target] if term in translated.casefold()]
    # A refrigerator may appear only when it is explicitly negated in the
    # scenario that requires that relation; otherwise it changes the cargo.
    has_refrigerated = any(re.search(pattern, translated, re.IGNORECASE) for pattern in patterns["refrigerated"])
    if has_refrigerated and "not_refrigerated" not in required:
        forbidden.append("added_refrigerated")
    if "not_refrigerated" in required and any(
        re.search(pattern, translated, re.IGNORECASE) for pattern in patterns["positive_refrigerated"]
    ):
        forbidden.append("opposite_refrigerated")
    if "tent" in required and any(
        re.search(pattern, translated, re.IGNORECASE) for pattern in patterns["not_tent"]
    ):
        forbidden.append("opposite_tent")
    if "cargo_ready" in required and any(
        re.search(pattern, translated, re.IGNORECASE) for pattern in patterns["not_cargo_ready"]
    ):
        forbidden.append("opposite_cargo_ready")
    return not missing and not forbidden, missing, forbidden


def percentile(values: list[float], quantile: float = 0.5) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, int((len(ordered) - 1) * quantile + 0.999999)))
    return round(ordered[index], 2)


def run_corpus() -> bool:
    case_id = 0
    rows: list[dict[str, object]] = []
    for source, target in PAIRS:
        for key, text in LANG_TEXT[source].items():
            case_id += 1
            for attempt in ("fresh", "warm_repeat"):
                status, payload, response_ms = post_translate(text, source, target)
                translated = payload.get("translated_text") if status is not None and status < 400 else None
                detail = payload.get("detail") if isinstance(payload, dict) else None
                error = detail.get("message") if isinstance(detail, dict) else detail
                semantic_pass, missing, forbidden = semantic_check(target, key, translated)
                row = {
                    "case_id": case_id, "phrase_kind": key, "attempt": attempt,
                    "source_lang": source, "target_lang": target, "input_text": text,
                    "http": status, "translated_text": translated,
                    "error_code": error if status is None or status >= 400 else None,
                    "semantic_pass": semantic_pass if status == 200 else False,
                    "missing_markers": missing, "forbidden_terms": forbidden,
                    "cache_hit": False, "cache_scope": "ai_endpoint_has_no_translation_memory",
                    "queue_ms": "unavailable", "model_load_ms": "preloaded_or_unavailable",
                    "inference_ms": "unavailable", "response_ms": response_ms,
                }
                # Keep rows in-memory solely to summarize the synthetic matrix.
                # They contain no application data.
                rows.append(row)
                emit("safe_translation", **row)
    summaries: dict[str, dict[str, object]] = {}
    for source, target in PAIRS:
        direction = f"{source}->{target}"
        direction_rows = [row for row in rows if row["source_lang"] == source and row["target_lang"] == target]
        summaries[direction] = {
            "total": len(direction_rows),
            "pass": sum(row["http"] == 200 and row["semantic_pass"] for row in direction_rows),
            "http_fail": sum(row["http"] != 200 for row in direction_rows),
            "semantic_fail": sum(row["http"] == 200 and not row["semantic_pass"] for row in direction_rows),
            "fresh_p50_ms": percentile([row["response_ms"] for row in direction_rows if row["attempt"] == "fresh"]),
            "fresh_p95_ms": percentile([row["response_ms"] for row in direction_rows if row["attempt"] == "fresh"], 0.95),
            "warm_p50_ms": percentile([row["response_ms"] for row in direction_rows if row["attempt"] == "warm_repeat"]),
            "warm_p95_ms": percentile([row["response_ms"] for row in direction_rows if row["attempt"] == "warm_repeat"], 0.95),
        }
    total = len(rows)
    passed = sum(row["http"] == 200 and row["semantic_pass"] for row in rows)
    emit("matrix_summary", total=total, pass_count=passed,
         http_fail=sum(row["http"] != 200 for row in rows),
         semantic_fail=sum(row["http"] == 200 and not row["semantic_pass"] for row in rows),
         directions=summaries)
    return passed == total


def model_inventory() -> None:
    models = AI_ROOT / "models"
    if not models.is_dir():
        emit("model_inventory", status="models_directory_missing")
        return
    for path in sorted(models.iterdir()):
        if path.is_dir():
            try:
                total = sum(item.stat().st_size for item in path.rglob("*") if item.is_file())
            except OSError:
                total = None
            emit("model_inventory", model_name=path.name, bytes_total=total)


def main() -> int:
    require_loopback_url()
    emit("diagnostic_policy", mode="safe_default", application_data="not_read", mutation="none")
    snapshot("before")
    model_inventory()
    matrix_pass = run_corpus()
    snapshot("after")
    return 0 if matrix_pass else 1


if __name__ == "__main__":
    raise SystemExit(main())
