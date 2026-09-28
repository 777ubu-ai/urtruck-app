#!/usr/bin/env python3
"""Safe-by-default QA2 local-AI translation diagnostics.

This runner sends only the synthetic logistics corpus below to the loopback
local-AI endpoint.  It has no application-data, database, or media inputs.
It neither changes QA2 nor downloads models.  Every output line is JSON.
"""

from __future__ import annotations

import json
import os
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
FACTS = {
    "cargo": ("1500", "10", "almaty", "astana", "tent"),
    "negation": ("not", "refriger", "tent", "20"),
    "schedule": ("urumqi", "warehouse", "09:30", "2026-10-01"),
    "price": ("12000", "usd", "15"),
    "short": (),
}


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


def normalized(text: str) -> str:
    return "".join(character.lower() for character in text if character.isalnum())


def fact_markers(target: str, key: str) -> tuple[str, ...]:
    # Markers are intentionally broad equivalents in each target language.
    localized = {
        "ru": {
            "almaty": "алматы", "astana": "астана", "tent": "тент",
            "not": "не", "refriger": "рефриж", "urumqi": "урумчи", "warehouse": "склад",
        },
        "zh": {
            "almaty": "阿拉木图", "astana": "阿斯塔纳", "tent": "篷布",
            "not": "不", "refriger": "冷藏", "urumqi": "乌鲁木齐", "warehouse": "仓库",
        },
        "en": {
            "almaty": "almaty", "astana": "astana", "tent": "tent",
            "not": "not", "refriger": "refriger", "urumqi": "urumqi", "warehouse": "warehouse",
        },
    }
    return tuple(localized[target].get(item, item) for item in FACTS[key])


def semantic_check(target: str, key: str, translated: str | None) -> tuple[bool, list[str], list[str]]:
    if not translated:
        return False, list(fact_markers(target, key)), []
    compact = normalized(translated)
    missing = [marker for marker in fact_markers(target, key) if normalized(marker) not in compact]
    forbidden = [term for term in ("водопад", "瀑布", "waterfall") if term in translated.lower()]
    return not missing and not forbidden, missing, forbidden


def run_corpus() -> None:
    case_id = 0
    for source, target in PAIRS:
        for key, text in LANG_TEXT[source].items():
            case_id += 1
            for attempt in ("fresh", "warm_repeat"):
                status, payload, response_ms = post_translate(text, source, target)
                translated = payload.get("translated_text") if status is not None and status < 400 else None
                detail = payload.get("detail") if isinstance(payload, dict) else None
                error = detail.get("message") if isinstance(detail, dict) else detail
                semantic_pass, missing, forbidden = semantic_check(target, key, translated)
                emit(
                    "safe_translation",
                    case_id=case_id,
                    phrase_kind=key,
                    attempt=attempt,
                    source_lang=source,
                    target_lang=target,
                    input_text=text,
                    http=status,
                    translated_text=translated,
                    error_code=error if status is None or status >= 400 else None,
                    semantic_pass=semantic_pass if status == 200 else False,
                    missing_markers=missing,
                    forbidden_terms=forbidden,
                    cache_hit=False,
                    cache_scope="ai_endpoint_has_no_translation_memory",
                    queue_ms="unavailable",
                    model_load_ms="preloaded_or_unavailable",
                    inference_ms="unavailable",
                    response_ms=response_ms,
                )


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
    run_corpus()
    snapshot("after")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
