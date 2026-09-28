"""Reason-code contract for the isolated QA2 translation quality gate."""
from qa_ai_service.quality import (
    _numeric_facts,
    repair_logistics_translation,
    translation_quality_failures,
    translation_quality_ok,
)


def test_quality_boolean_is_exact_negation_of_failure_list():
    source = "Алматы — Астана, груз 1500 USD, 10 тонн, тент."
    good = "阿拉木图—阿斯塔纳：货物1500 USD，10吨，篷布车。"
    bad = "阿拉木图—阿斯塔纳：货物1500 USD，20吨，瀑布。"
    assert translation_quality_failures(source, good, "ru", "zh") == []
    assert translation_quality_ok(source, good, "ru", "zh") is True
    assert translation_quality_ok(source, bad, "ru", "zh") is (
        not translation_quality_failures(source, bad, "ru", "zh")
    )


def test_failure_reasons_explain_changed_numbers_weight_city_and_body_type():
    source = "Алматы — Астана, груз 1500 USD, 10 тонн, тент."
    failures = translation_quality_failures(
        source, "阿斯塔纳：货物1500 USD，20吨，瀑布。", "ru", "zh"
    )
    assert "numeric_facts_changed" in failures
    assert "weight_value_changed" in failures
    assert "city_missing:almaty" in failures
    assert "body_type_missing" in failures
    assert len(failures) == len(set(failures))


def test_failure_reasons_detect_invented_weight():
    failures = translation_quality_failures(
        "Маршрут Алматы — Астана, тент.",
        "路线阿拉木图到阿斯塔纳，10吨，篷布车。",
        "ru",
        "zh",
    )
    assert "weight_invented" in failures


def test_numeric_facts_normalize_thousands_but_not_digit_currency_or_weight_changes():
    source = "Цена 12000 USD, вес 15 тонн."
    equivalents = (
        "Цена 12 000 долларов, вес 15 тонн.",
        "Price $12,000, weight 15 tons.",
        "价格12000美元，重量15吨。",
    )
    for candidate, target in zip(equivalents, ("ru", "en", "zh")):
        assert translation_quality_failures(source, candidate, "ru", target) == []
    assert translation_quality_failures(source, "Цена 1200 USD, вес 15 тонн.", "ru", "ru")
    assert translation_quality_failures(source, "Цена 12000 EUR, вес 15 тонн.", "ru", "ru") == ["currency_facts_changed"]
    assert translation_quality_failures(source, "Цена 12000 USD, вес 15 долларов.", "ru", "ru")
    assert _numeric_facts("12,5") != _numeric_facts("12,500")


def test_chinese_classifier_is_not_a_numeric_fact_but_tonnage_is():
    source = "Not a refrigerated truck: a tent truck is required, 20 tonnes."
    candidate = "没有冷藏卡车:需要一个帐卡车,重量20 吨, 篷布车."
    repaired = repair_logistics_translation(source, candidate, "en", "zh")
    assert "帐卡车" not in repaired
    assert translation_quality_failures(source, repaired, "en", "zh") == []
    changed_weight = repaired.replace("20 吨", "10 吨")
    assert "weight_value_changed" in translation_quality_failures(source, changed_weight, "en", "zh")


def test_observed_city_body_and_reefer_repairs_are_narrow():
    source = "阿拉木图—阿斯塔纳：货物1500美元，10吨，篷布车。不是冷藏车。"
    candidate = "Арматутян Астану: груз 1500 долларов, 10 тонн, водопад, тент. Не холодильник."
    repaired = repair_logistics_translation(source, candidate, "zh", "ru")
    assert "Арматутян" not in repaired
    assert "водопад" not in repaired
    assert "холодильник" not in repaired
    assert "Алматы" in repaired and "Астану" in repaired and "рефрижератор" in repaired
    assert translation_quality_failures(source, repaired, "zh", "ru") == []

    ordinary_source = "Tent truck is parked near a waterfall."
    ordinary_candidate = "тент стоит у водопада."
    assert "водопад" in repair_logistics_translation(ordinary_source, ordinary_candidate, "en", "ru")
