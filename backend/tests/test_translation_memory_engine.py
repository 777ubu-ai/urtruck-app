import json
import statistics
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from qa_ai_service.translation_memory.engine import TranslationMemory
from qa_ai_service.translation_memory.normalizer import normalize_text, normalized_slot_key
from qa_ai_service.translation_memory.schemas import SlotSpec, TemplateRecord
from qa_ai_service.translation_memory.validators import validate_facts


def approved(*, intent="greeting", ru="Привет", zh="你好", en="Hello"):
    return TemplateRecord(
        template_id=f"{intent}-approved",
        category="test",
        version=1,
        status="approved",
        intent=intent,
        slots=(),
        translations={"ru": ru, "zh": zh, "en": en},
    )


def test_exact_approved_match_and_candidate_is_never_returned(monkeypatch):
    candidate = TemplateRecord("candidate", "test", 1, "candidate", "greeting", (), {"ru": "Привет", "zh": "你好"})
    tm = TranslationMemory([candidate])
    monkeypatch.setenv("TRANSLATION_MEMORY_ENABLED", "true")
    assert tm.translate("Привет", "ru", "zh", "greeting").text is None
    assert tm.metrics.counters["tm_miss"] == 1


def test_feature_flag_keeps_nllb_path_in_shadow(monkeypatch):
    monkeypatch.delenv("TRANSLATION_MEMORY_ENABLED", raising=False)
    tm = TranslationMemory([approved()])
    result = tm.translate(" Привет! ", "ru", "zh", "greeting")
    assert result.hit is False  # punctuation makes this an exact miss, no fuzzy lookup
    assert result.fallback_required is True


def test_exact_match_returns_only_when_enabled(monkeypatch):
    monkeypatch.setenv("TRANSLATION_MEMORY_ENABLED", "true")
    tm = TranslationMemory([approved()])
    result = tm.translate("Привет", "ru", "zh", "greeting")
    assert (result.text, result.hit, result.validation_passed) == ("你好", True, True)
    assert result.fallback_required is False


def test_slot_template_uses_anchored_exact_match(monkeypatch):
    monkeypatch.setenv("TRANSLATION_MEMORY_ENABLED", "true")
    record = TemplateRecord(
        "weight", "cargo", 1, "approved", "cargo_weight",
        (SlotSpec("weight", "weight"), SlotSpec("weight_unit", "weight_unit")),
        {"ru": "Вес груза: {weight} {weight_unit}.", "en": "Cargo weight: {weight} tons."},
    )
    tm = TranslationMemory([record])
    assert tm.translate("Вес груза: 10 тонн.", "ru", "en", "cargo_weight").text == "Cargo weight: 10 tons."
    assert tm.translate("Вес груза: 10 тонн и ещё что-то.", "ru", "en", "cargo_weight").hit is False


def test_normalization_nfkc_whitespace_and_slots():
    assert normalize_text("  １５００  USD\u00a0 ") == "1500 usd"
    assert normalized_slot_key({"weight": "1 500", "weight_unit": "тонн"}) == "weight=1500|weight_unit=ton"


def test_fact_validator_preserves_logistics_values_and_polarity():
    source = "Алматы — Астана, 1500 USD, 10 тонн, тент, рефрижератор не нужен."
    good = "Almaty - Astana, 1500 USD, 10 tons, tent truck, no reefer."
    bad_number = "Almaty - Astana, 1600 USD, 10 tons, tent truck, no reefer."
    bad_negation = "Almaty - Astana, 1500 USD, 10 tons, tent truck, reefer required."
    assert validate_facts(source, good, "ru", "en")[0]
    assert "amount_changed" in validate_facts(source, bad_number, "ru", "en")[1]
    assert "negation_changed" in validate_facts(source, bad_negation, "ru", "en")[1]


def test_renderer_rejects_unresolved_or_untrusted_slots():
    from qa_ai_service.translation_memory.renderer import render
    assert render("Cargo {city_to}", {}) is None
    assert render("Cargo {city_to}", {"city_to": "Astana"}) == "Cargo Astana"
    assert render("Cargo {city_to}", {"city_to": "Astana{evil}"}) is None


def test_concurrent_exact_lookup_is_deterministic(monkeypatch):
    monkeypatch.setenv("TRANSLATION_MEMORY_ENABLED", "true")
    tm = TranslationMemory([approved()])
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _: tm.translate("Привет", "ru", "zh", "greeting").text, range(100)))
    assert results == ["你好"] * 100


def test_metrics_have_no_raw_message_text():
    tm = TranslationMemory([])
    tm.translate("Секретный номер пломбы 45821", "ru", "zh", "cargo")
    snapshot = tm.metrics.snapshot()
    assert "45821" not in repr(snapshot)
    assert "Секретный" not in repr(snapshot)


def test_all_seed_records_are_candidates_only():
    data_dir = Path(__file__).resolve().parents[1] / "qa_ai_service" / "translation_memory" / "data"
    rows = [json.loads(line) for path in data_dir.glob("*.jsonl") for line in path.read_text().splitlines() if line.strip()]
    assert rows
    assert all(row["status"] == "candidate" for row in rows)


def test_protected_slot_types_are_declared():
    slot = SlotSpec("seal_number", "seal_number", required=True)
    assert slot.required and slot.type == "seal_number"


def test_exact_match_benchmark_is_within_local_budget(monkeypatch):
    monkeypatch.setenv("TRANSLATION_MEMORY_ENABLED", "true")
    tm = TranslationMemory([approved()])
    samples = []
    for _ in range(200):
        started = time.perf_counter()
        tm.translate("Привет", "ru", "zh", "greeting")
        samples.append((time.perf_counter() - started) * 1000)
    assert statistics.median(samples) <= 50
    assert statistics.quantiles(samples, n=20)[18] <= 200
