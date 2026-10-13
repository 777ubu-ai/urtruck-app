"""Quality gates for the isolated QA2 speech and translation service."""
from pathlib import Path
import pytest

from qa_ai_service.quality import (
    _currency_amount_facts,
    repair_logistics_translation,
    stt_prompt,
    transcription_quality_ok,
    translation_quality_failures,
    translation_quality_ok,
    select_quality_translation,
)


def test_quality_422_exposes_reason_codes_without_candidate_text():
    service = (Path(__file__).parents[1] / "qa_ai_service" / "main.py").read_text()
    assert '"reason_codes": best_failures' in service
    assert '"candidate": translated' not in service


def test_stt_prompt_contains_vehicle_body_vocabulary_without_rewrite_rules():
    prompt = stt_prompt("ru")
    assert "тент" in prompt
    assert "рефрижератор" in prompt
    assert "платформа" in prompt
    assert "ТЭН" not in prompt


def test_logistics_translation_rejects_lost_meaning():
    source = "Cargo is ready. Please arrive at the warehouse tomorrow morning."
    bad = "牛奶准备好！奶酪在烤箱里。"
    assert translation_quality_ok(source, bad, "en", "zh") is False


def test_logistics_translation_accepts_correct_meaning():
    source = "Cargo is ready. Please arrive at the warehouse tomorrow morning."
    good = "货物已准备好。请明天早上到仓库。"
    assert translation_quality_ok(source, good, "en", "zh") is True


def test_quality_gate_selects_valid_nbest_candidate_without_source_fallback():
    source = "TEST: 1500 USD, 20 tonnes. Do not unload without confirmation."
    rejected = "测试：1500美元，20吨。"
    accepted = "测试：1500 USD，20吨。未经确认不得卸货。"
    selected, failures = select_quality_translation(source, [rejected, accepted], "en", "zh")
    assert selected == accepted
    assert failures == []

    selected, failures = select_quality_translation(source, [rejected], "en", "zh")
    assert selected == rejected
    assert failures
    assert selected != source


def test_route_clear_is_traffic_status_not_route_cleaning_en_zh():
    source = "Route clear. Continue to the warehouse."
    bad = "路线清理。继续前往仓库。"
    repaired = repair_logistics_translation(source, bad, "en", "zh")
    assert repaired == "道路畅通。继续前往仓库。"
    assert translation_quality_ok(source, repaired, "en", "zh") is True
    assert translation_quality_ok(source, bad, "en", "zh") is False


def test_untranslated_uppercase_ru_greeting_is_repaired_for_zh():
    repaired = repair_logistics_translation("ПРИВЕТ", "ПРИВЕТ", "ru", "zh")
    assert repaired == "你好"
    assert translation_quality_ok("ПРИВЕТ", repaired, "ru", "zh") is True


def test_logistics_translation_preserves_numbers():
    assert translation_quality_ok(
        "Driver arrives at the border at 09:30.",
        "司机将在10:30到达边境。",
        "en",
        "zh",
    ) is False


def test_logistics_translation_preserves_weight_unit_and_tent_ru_zh():
    source = "Алматы, Астана, груз, 10 тонн, тент."
    raw = "阿尔马塔,阿斯塔纳,货物,10,."
    assert translation_quality_ok(source, raw, "ru", "zh") is False
    repaired = repair_logistics_translation(source, raw, "ru", "zh")
    assert repaired == "阿拉木图,阿斯塔纳,货物,10 吨, 篷布车."
    assert translation_quality_ok(source, repaired, "ru", "zh") is True


def test_logistics_translation_preserves_weight_unit_and_tent_zh_ru():
    source = "阿拉木图,阿斯塔纳,货物,10 吨,篷布车。"
    raw = "Алматы, Астана, груз, 10,."
    assert translation_quality_ok(source, raw, "zh", "ru") is False
    repaired = repair_logistics_translation(source, raw, "zh", "ru")
    assert repaired == "Алматы, Астана, груз, 10 тонн, тент."
    assert translation_quality_ok(source, repaired, "zh", "ru") is True


def test_weight_unit_stays_with_weight_not_price_ru_zh():
    source = "Цена 1500 USD, вес 10 тонн."
    good = "价格 1500 USD，重量 10 吨。"
    bad = "价格 1500 吨 USD，重量 10。"
    assert translation_quality_ok(source, good, "ru", "zh") is True
    assert translation_quality_ok(source, bad, "ru", "zh") is False
    assert repair_logistics_translation(source, bad, "ru", "zh") == bad


def test_message_82_preserves_price_weight_unit_and_body_ru_zh():
    source = "Алматы, Астана, груз, 1500 USD, 10 тонн, тент."
    good = "阿拉木图, 阿斯塔纳, 货物, 1500 USD, 10 吨, 篷布车。"
    bad = "阿拉木图, 阿斯塔纳, 货物, 1500 吨 USD, 10, ТЭН。"
    assert translation_quality_ok(source, good, "ru", "zh") is True
    assert translation_quality_ok(source, bad, "ru", "zh") is False


def test_control_phrase_repairs_weight_after_price_without_binding_price():
    source = "Алматы — Астана, груз 1500 USD, 10 тонн, тент."
    raw = "阿拉木图阿斯塔纳,货物1500美元,10,篷布车."
    repaired = repair_logistics_translation(source, raw, "ru", "zh")
    assert "1500美元" in repaired
    assert "10 吨" in repaired
    assert "1500 吨" not in repaired
    assert translation_quality_ok(source, repaired, "ru", "zh") is True


def test_control_phrase_repairs_truncated_astana_and_weight_ru_zh():
    source = "Алматы — Астана, груз, 10 тонн, тент."
    raw = "阿拉木图阿斯塔货物10, 篷布车."
    repaired = repair_logistics_translation(source, raw, "ru", "zh")
    assert "阿拉木图" in repaired
    assert "阿斯塔纳" in repaired
    assert "10 吨" in repaired
    assert translation_quality_ok(source, repaired, "ru", "zh") is True


def test_message_82_preserves_price_weight_unit_and_body_zh_ru():
    source = "阿拉木图, 阿斯塔纳, 货物, 1500 USD, 10 吨, 篷布车。"
    good = "Алматы, Астана, груз, 1500 USD, 10 тонн, тент."
    bad = "Алматы, Астана, груз, 1500 тонн USD, 10, ТЭН。"
    assert translation_quality_ok(source, good, "zh", "ru") is True
    assert translation_quality_ok(source, bad, "zh", "ru") is False


def test_weight_unit_stays_with_weight_not_price_zh_ru():
    source = "价格 1500 USD，重量 10 吨。"
    good = "Цена 1500 USD, вес 10 тонн."
    bad = "Цена 1500 тонн USD, вес 10."
    assert translation_quality_ok(source, good, "zh", "ru") is True
    assert translation_quality_ok(source, bad, "zh", "ru") is False
    assert repair_logistics_translation(source, bad, "zh", "ru") == bad


def test_two_different_weights_are_bound_individually_in_both_directions():
    ru_source = "Основной вес 10 тонн, дополнительный вес 20 тонн."
    zh_good = "主重量 10 吨，附加重量 20 吨。"
    zh_bad = "主重量 10 吨，附加重量 20。"
    assert translation_quality_ok(ru_source, zh_good, "ru", "zh") is True
    assert translation_quality_ok(ru_source, zh_bad, "ru", "zh") is False

    zh_source = "主重量 10 吨，附加重量 20 吨。"
    ru_good = "Основной вес 10 тонн, дополнительный вес 20 тонн."
    ru_bad = "Основной вес 10 тонн, дополнительный вес 20."
    assert translation_quality_ok(zh_source, ru_good, "zh", "ru") is True
    assert translation_quality_ok(zh_source, ru_bad, "zh", "ru") is False


def test_plate_number_cannot_receive_weight_unit():
    source = "Госномер KZ 1500 AB, вес 10 тонн."
    wrong_binding = "车牌 KZ 1500 吨 AB，重量 10。"
    good = "车牌 KZ 1500 AB，重量 10 吨。"
    assert translation_quality_ok(source, wrong_binding, "ru", "zh") is False
    assert repair_logistics_translation(source, wrong_binding, "ru", "zh") == wrong_binding
    assert translation_quality_ok(source, good, "ru", "zh") is True


def test_plate_number_cannot_receive_weight_unit_zh_ru():
    source = "牌照 KZ 1500 AB，重量 10 吨。"
    wrong_binding = "Госномер KZ 1500 тонн AB, вес 10."
    good = "Госномер KZ 1500 AB, вес 10 тонн."
    assert translation_quality_ok(source, wrong_binding, "zh", "ru") is False
    assert repair_logistics_translation(source, wrong_binding, "zh", "ru") == wrong_binding
    assert translation_quality_ok(source, good, "zh", "ru") is True


def test_date_number_cannot_receive_weight_unit():
    source = "Дата 2026-09-27, вес 10 тонн."
    wrong_binding = "日期 2026-09-27 吨，重量 10。"
    assert translation_quality_ok(source, wrong_binding, "ru", "zh") is False
    assert repair_logistics_translation(source, wrong_binding, "ru", "zh") == wrong_binding


def test_weight_without_number_is_not_filled_or_invented():
    source = "Вес: тонн, тент."
    missing = "重量，篷布车。"
    invented = "重量 10 吨，篷布车。"
    explicit_unit = "重量，吨，篷布车。"
    assert translation_quality_ok(source, missing, "ru", "zh") is False
    assert translation_quality_ok(source, invented, "ru", "zh") is False
    assert translation_quality_ok(source, explicit_unit, "ru", "zh") is True
    assert repair_logistics_translation(source, missing, "ru", "zh") == missing


def test_weight_without_number_is_not_filled_or_invented_zh_ru():
    source = "重量：吨，篷布车。"
    missing = "Вес, тент."
    invented = "Вес 10 тонн, тент."
    explicit_unit = "Вес: тонн, тент."
    assert translation_quality_ok(source, missing, "zh", "ru") is False
    assert translation_quality_ok(source, invented, "zh", "ru") is False
    assert translation_quality_ok(source, explicit_unit, "zh", "ru") is True
    assert repair_logistics_translation(source, missing, "zh", "ru") == missing


def test_message_81_phrase_repair_is_bound_to_the_only_weight_number():
    source = "Алматы, Астана, груз, 10 тонн, тент."
    raw = "阿尔马塔,阿斯塔纳,货物,10,."
    repaired = repair_logistics_translation(source, raw, "ru", "zh")
    assert repaired == "阿拉木图,阿斯塔纳,货物,10 吨, 篷布车."
    assert translation_quality_ok(source, repaired, "ru", "zh") is True


def test_physical_message_248_almaty_variant_is_repaired_without_bypassing_gate():
    # Exact transcript and NLLB candidate captured for physical voice message
    # 248. The repair is intentionally bound to this observed city spelling.
    source = (
        "Привет! Где находится машина? Документы готовы. Мы едем в Алматы. "
        "Сообщите время прибытия на границу."
    )
    observed_nllb = "你好!车在哪里?文件准备好了.我们要去阿尔马图.请告诉我们抵达边境的时间."
    repaired = repair_logistics_translation(source, observed_nllb, "ru", "zh")
    assert "阿拉木图" in repaired
    assert "阿尔马图" not in repaired
    assert translation_quality_ok(source, repaired, "ru", "zh") is True


def test_all_observed_almaty_variants_are_repaired_in_mixed_candidate():
    source = "Алматы — важный город. Мы едем в Алматы."
    mixed = "阿拉木图是一个重要城市。我们要去阿尔马图， затем 阿尔马塔。"
    repaired = repair_logistics_translation(source, mixed, "ru", "zh")
    assert repaired.count("阿拉木图") == 3
    assert "阿尔马图" not in repaired
    assert "阿尔马塔" not in repaired
    assert translation_quality_ok(source, repaired, "ru", "zh") is True


def test_missing_known_route_city_is_preserved_with_direction():
    source = "Маршрут: Астана → Алматы."
    candidate = "路线：阿斯塔纳 → ."
    repaired = repair_logistics_translation(source, candidate, "ru", "zh")
    assert "Астана" not in repaired
    assert "阿斯塔纳 → 阿拉木图" in repaired
    assert translation_quality_ok(source, repaired, "ru", "zh") is True


def test_unknown_almaty_spelling_is_replaced_by_the_known_source_city():
    source = "Мы едем в Алматы."
    unknown = "我们要去阿尔玛蒂."
    repaired = repair_logistics_translation(source, unknown, "ru", "zh")
    assert "阿拉木图" in repaired
    assert translation_quality_ok(source, repaired, "ru", "zh") is True


def test_other_city_cannot_be_repaired_as_almaty():
    source = "Мы едем в Астану."
    wrong_city = "我们要去阿尔马图."
    repaired = repair_logistics_translation(source, wrong_city, "ru", "zh")
    assert "阿拉木图" not in repaired
    assert "阿斯塔纳" in repaired
    assert "unexpected_city:almaty" in translation_quality_failures(source, repaired, "ru", "zh")


def test_message_248_repair_preserves_the_currency_bound_price():
    source = "Мы едем в Алматы. Цена 1450 USD, груз 10 тонн."
    changed = "我们要去阿尔马图.价格 1500 USD,货物 10 吨."
    repaired = repair_logistics_translation(source, changed, "ru", "zh")
    failures = translation_quality_failures(source, repaired, "ru", "zh")
    assert "阿拉木图" in repaired
    assert "1450 USD" in repaired
    assert "numeric_facts_changed" not in failures
    assert translation_quality_ok(source, repaired, "ru", "zh") is True


def test_controlled_factual_repairs_fix_changed_price_weight_and_unloading_condition():
    source = (
        "TEST r2: Freight is 1200 USD, 15 October 2026, Almaty to Astana, "
        "18 tonnes. Do not unload without confirmation."
    )
    candidate = "ТЕСТ r2: Фрахт 1300 USD, 15 октября 2026, Алматы → Астана, груз 20 тонн."
    repaired = repair_logistics_translation(source, candidate, "en", "ru")
    assert "1200 USD" in repaired
    assert "18 тонн" in repaired
    assert "Разгрузка запрещена без подтверждения." in repaired
    assert translation_quality_ok(source, repaired, "en", "ru") is True


def test_physical_ru_zh_control_preserves_price_date_route_weight_and_negation():
    source = (
        "ТЕСТ r1: 1500 USD, 14.10.2026, Астана → Алматы, 20 тонн. "
        "Не разгружать без подтверждения."
    )
    candidate = "测试 r1：1600 USD，2026年10月14日，阿斯塔纳 → ，20 吨。"
    repaired = repair_logistics_translation(source, candidate, "ru", "zh")
    assert "1500 USD" in repaired
    assert "2026年10月14日" in repaired
    assert "阿斯塔纳 → 阿拉木图" in repaired
    assert "20 吨" in repaired
    assert "未经确认不得卸货" in repaired
    assert translation_quality_ok(source, repaired, "ru", "zh") is True


def test_chinese_unload_prohibition_is_preserved_in_russian_translation():
    source = "运费1200美元，2026年10月15日从阿拉木图到阿斯塔纳，货重18吨。未经确认不得卸货。"
    candidate = "Фрахт 1300 USD, 15 октября 2026, Алматы → Астана, груз 20 тонн."
    repaired = repair_logistics_translation(source, candidate, "zh", "ru")
    assert "1200" in repaired
    assert "18 тонн" in repaired
    assert "Разгрузка запрещена без подтверждения." in repaired
    assert translation_quality_ok(source, repaired, "zh", "ru") is True


def test_multiple_currency_amounts_are_not_repaired_by_position():
    source = "Price 100 USD, deposit 20 USD."
    candidate = "Депозит 20 USD, цена 100 USD."
    repaired = repair_logistics_translation(source, candidate, "en", "ru")
    assert repaired == candidate
    assert "numeric_facts_changed" in translation_quality_failures(source, repaired, "en", "ru")


def test_multiple_currency_amounts_with_swapped_currency_binding_fail_closed():
    source = "100 USD and 200 EUR."
    candidate = "200 EUR и 100 USD."
    repaired = repair_logistics_translation(source, candidate, "en", "ru")
    assert repaired == candidate
    assert "numeric_facts_changed" in translation_quality_failures(source, repaired, "en", "ru")


def test_currency_amounts_cannot_be_swapped_while_numbers_keep_the_same_order():
    source = "100 USD and 200 EUR."
    candidate = "100 EUR и 200 USD."
    repaired = repair_logistics_translation(source, candidate, "en", "ru")
    failures = translation_quality_failures(source, repaired, "en", "ru")
    assert repaired == candidate
    assert "currency_amount_binding_changed" in failures


def test_multiple_weights_are_not_remapped_when_clause_order_changes():
    source = "Ship 18 tonnes of grain and 20 tonnes of steel."
    candidate = "Отправьте 20 тонн стали и 18 тонн зерна."
    repaired = repair_logistics_translation(source, candidate, "en", "ru")
    assert repaired == candidate
    assert "numeric_facts_changed" in translation_quality_failures(source, repaired, "en", "ru")


def test_correct_english_unloading_negation_is_not_flagged_as_contradiction():
    source = "Не разгружать без подтверждения."
    translated = "Do not unload without confirmation."
    assert "unloading_condition_flipped" not in translation_quality_failures(source, translated, "ru", "en")
    assert translation_quality_ok(source, translated, "ru", "en") is True


@pytest.mark.parametrize(
    ("source", "candidate", "source_lang", "target_lang"),
    [
        ("Не разгружать без подтверждения.", "Unload without confirmation.", "ru", "en"),
        ("Do not unload without confirmation.", "Разгрузка разрешена без подтверждения.", "en", "ru"),
    ],
)
def test_opposite_unloading_condition_is_not_repaired_into_a_false_pass(
    source, candidate, source_lang, target_lang
):
    repaired = repair_logistics_translation(source, candidate, source_lang, target_lang)
    failures = translation_quality_failures(source, repaired, source_lang, target_lang)
    assert "unloading_condition_flipped" in failures
    assert translation_quality_ok(source, repaired, source_lang, target_lang) is False


def test_currency_binding_check_accepts_dollar_symbol_for_usd():
    assert _currency_amount_facts("Price 100 USD.") == _currency_amount_facts("Цена $100.")


def test_reordered_russian_unloading_prohibition_is_not_rejected():
    source = "Не разгружать без подтверждения."
    translated = "Без подтверждения не разгружать."
    assert translation_quality_ok(source, translated, "ru", "ru") is True


@pytest.mark.parametrize(
    ("source", "candidate", "source_lang", "target_lang"),
    [
        ("Не разгружать без подтверждения.", "Do not unload. Unload without confirmation.", "ru", "en"),
        ("Не разгружать без подтверждения.", "Do not unload, unload without confirmation.", "ru", "en"),
        ("Не разгружать без подтверждения.", "Do not unload without confirmation and unload without confirmation.", "ru", "en"),
        ("Не разгружать без подтверждения.", "Не разгружать. Разрешена разгрузка без подтверждения.", "ru", "ru"),
        ("Не разгружать без подтверждения.", "Не разгружать, разгружать без подтверждения.", "ru", "ru"),
        ("Не разгружать без подтверждения.", "Не разгружать без подтверждения и можно разгружать без подтверждения.", "ru", "ru"),
    ],
)
def test_separate_opposite_unloading_clause_cannot_be_hidden_by_negation(
    source, candidate, source_lang, target_lang
):
    repaired = repair_logistics_translation(source, candidate, source_lang, target_lang)
    assert "unloading_condition_flipped" in translation_quality_failures(source, repaired, source_lang, target_lang)


def test_currency_amount_binding_accepts_grouped_thousands():
    assert _currency_amount_facts("Цена 12 500 USD.") == _currency_amount_facts("价格 12500 USD.")


def test_kazakh_unloading_repair_is_detected_and_not_duplicated():
    source = "Не разгружать без подтверждения."
    candidate = "Жүкті жеткізіңіз."
    repaired = repair_logistics_translation(source, candidate, "ru", "kk")
    assert repaired.count("Растау алынбайынша жүкті түсірмеңіз") == 1
    assert translation_quality_ok(source, repaired, "ru", "kk") is True


def test_message_81_phrase_repair_is_bound_to_the_only_weight_number_zh_ru():
    source = "阿拉木图,阿斯塔纳,货物,10 吨,篷布车。"
    raw = "Алматы, Астана, груз, 10,."
    repaired = repair_logistics_translation(source, raw, "zh", "ru")
    assert repaired == "Алматы, Астана, груз, 10 тонн, тент."
    assert translation_quality_ok(source, repaired, "zh", "ru") is True


def test_logistics_translation_rejects_missing_city_even_when_number_survives():
    source = "Алматы, Астана, груз, 10 тонн, тент."
    candidate = "阿斯塔纳,货物,10 吨,篷布车."
    assert translation_quality_ok(source, candidate, "ru", "zh") is False


def test_glossary_repairs_unambiguous_trailer_truck_confusion():
    repaired = repair_logistics_translation(
        "Прицеп номер A123BC и документы готовы.",
        "卡车号码是A123BC,文件都准备好了.",
        "ru",
        "zh",
    )
    assert repaired == "挂车号码是A123BC,文件都准备好了."
    assert translation_quality_ok(
        "Прицеп номер A123BC и документы готовы.", repaired, "ru", "zh"
    ) is True


def test_quality_gate_accepts_equivalent_chinese_time_notation():
    assert translation_quality_ok(
        "The driver arrives at the border at 09:30.",
        "司机将于9点半抵达边境。",
        "en",
        "zh",
    ) is True


def test_quality_gate_supports_kazakh_logistics_terms():
    assert translation_quality_ok(
        "Жүк қоймада, жүргізуші шекарада.",
        "货物在仓库，司机在边境。",
        "kk",
        "zh",
    ) is True


def test_transcription_rejects_physical_xiaomi_hallucination():
    assert transcription_quality_ok(
        "Корбус ready. При сырае в доварку с твором мони.", "ru", 0.91
    ) is False


def test_transcription_rejects_low_word_confidence():
    assert transcription_quality_ok(
        "Груз готов. Водитель будет на складе утром.", "ru", 0.49
    ) is False


def test_transcription_accepts_clear_supported_scripts():
    assert transcription_quality_ok(
        "Груз готов. Водитель будет на складе утром.", "ru", 0.91
    ) is True
    assert transcription_quality_ok(
        "货物准备好了，司机早上到仓库。", "zh", 0.91
    ) is True
    assert transcription_quality_ok(
        "Cargo is ready. The driver will arrive at the warehouse.", "en", 0.91
    ) is True


def test_transcription_allows_known_latin_city_in_russian():
    assert transcription_quality_ok(
        "Груз готов на складе Almaty.", "ru", 0.91
    ) is True
