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
