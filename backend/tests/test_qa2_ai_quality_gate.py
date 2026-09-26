"""Quality gates for the isolated QA2 speech and translation service."""
from qa_ai_service.quality import (
    repair_logistics_translation,
    transcription_quality_ok,
    translation_quality_ok,
)


def test_logistics_translation_rejects_lost_meaning():
    source = "Cargo is ready. Please arrive at the warehouse tomorrow morning."
    bad = "牛奶准备好！奶酪在烤箱里。"
    assert translation_quality_ok(source, bad, "en", "zh") is False


def test_logistics_translation_accepts_correct_meaning():
    source = "Cargo is ready. Please arrive at the warehouse tomorrow morning."
    good = "货物已准备好。请明天早上到仓库。"
    assert translation_quality_ok(source, good, "en", "zh") is True


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
