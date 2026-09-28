"""Reason-code contract for the isolated QA2 translation quality gate."""
from qa_ai_service.quality import translation_quality_failures, translation_quality_ok


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
