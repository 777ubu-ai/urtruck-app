"""Reason-code contract for the isolated QA2 translation quality gate."""
from qa_ai_service.quality import (
    _polarity,
    _numeric_facts,
    repair_logistics_translation,
    translation_quality_failures,
    translation_quality_ok,
)
from pathlib import Path


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


def test_quality_gate_preserves_negation_and_readiness_in_all_six_directions():
    negative_reefer = {
        "ru": "Не рефрижератор.", "zh": "不是冷藏车。", "en": "Not a refrigerated truck.",
    }
    positive_reefer = {
        "ru": "Нужен рефрижератор.", "zh": "需要冷藏车。", "en": "A refrigerated truck is required.",
    }
    negative_tent = {
        "ru": "Тент не нужен.", "zh": "不需要篷布车。", "en": "Tent truck is not needed.",
    }
    positive_tent = {
        "ru": "Нужен тент.", "zh": "需要篷布车。", "en": "A tent truck is required.",
    }
    ready = {
        "ru": "Груз готов.", "zh": "货物准备好了。", "en": "Shipment is ready.",
    }
    not_ready = {
        "ru": "Груз не готов.", "zh": "货物还没有准备好。", "en": "Shipment is not ready.",
    }
    for source, target in (("ru", "zh"), ("zh", "ru"), ("ru", "en"), ("en", "ru"), ("en", "zh"), ("zh", "en")):
        assert not translation_quality_failures(negative_reefer[source], negative_reefer[target], source, target)
        assert "negation_flipped:refrigerated" in translation_quality_failures(negative_reefer[source], positive_reefer[target], source, target)
        assert not translation_quality_failures(negative_tent[source], negative_tent[target], source, target)
        assert "negation_flipped:tent" in translation_quality_failures(negative_tent[source], positive_tent[target], source, target)
        assert not translation_quality_failures(ready[source], ready[target], source, target)
        assert "cargo_readiness_flipped" in translation_quality_failures(ready[source], not_ready[target], source, target)
        assert "cargo_readiness_flipped" in translation_quality_failures(not_ready[source], ready[target], source, target)


def test_quality_gate_rejects_lost_negation_and_question_no_readiness():
    assert "negation_lost:refrigerated" in translation_quality_failures(
        "Не рефрижератор.", "Truck is ready.", "ru", "en"
    )
    assert "negation_lost:tent" in translation_quality_failures(
        "不需要篷布车。", "Требуется машина.", "zh", "ru"
    )
    assert "cargo_readiness_flipped" in translation_quality_failures(
        "Goods are ready? No.", "货物准备好了。", "en", "zh"
    )
    assert "cargo_readiness_missing" in translation_quality_failures(
        "Shipment is ready.", "司机到仓库。", "en", "zh"
    )


def test_extended_ru_zh_en_negative_forms_do_not_match_positive_substrings():
    for language, concept, values in (
        ("zh", "refrigerated", ("不要冷藏车", "不用冷藏车", "无需冷藏车")),
        ("zh", "tent", ("不要篷布车", "不用篷布车", "无需篷布车")),
        ("ru", "refrigerated", ("рефрижератор не требуется", "без рефрижератора")),
        ("ru", "tent", ("тент не требуется", "без тента")),
        ("en", "refrigerated", ("no reefer", "no refrigerated truck", "do not need a reefer", "don't need a reefer")),
        ("en", "tent", ("no tent truck", "don't need a tent truck")),
    ):
        for text in values:
            assert _polarity(text, language, concept) == "negative"
    for language, text in (("ru", "груз ещё не готов"), ("en", "cargo isn't ready"), ("en", "goods aren't ready")):
        assert _polarity(text, language, "cargo_readiness") == "negative"
    assert _polarity("需要冷藏车", "zh", "refrigerated") == "positive"
    assert _polarity("需要篷布车", "zh", "tent") == "positive"


def test_urumqi_alias_and_repair_are_strictly_scoped():
    assert not translation_quality_failures(
        "Урумчи, склад, 09:30.", "Urumchi, warehouse, 09:30.", "ru", "en"
    )
    repaired = repair_logistics_translation(
        "乌鲁木齐，仓库，09:30。", "Уруми-Ци, склад, 09:30.", "zh", "ru"
    )
    assert repaired == "Урумчи, склад, 09:30."
    assert repair_logistics_translation(
        "货物在仓库。", "Уруми-Ци, склад.", "zh", "ru"
    ) == "Уруми-Ци, склад."


def test_health_source_sha_and_deploy_verification_contract_are_present():
    root = Path(__file__).resolve().parents[2]
    main = (root / "backend/qa_ai_service/main.py").read_text()
    deploy = (root / "scripts/deploy-qa2-local-ai.sh").read_text()
    assert 'QA2_AI_SOURCE_SHA' in main and '"source_sha": SOURCE_SHA' in main
    assert '"${QA_SOURCE_SHA:?}"' in deploy
    assert 'Environment=QA2_AI_SOURCE_SHA=$source_sha' in deploy
    assert "'source_sha':sys.argv[1]" in deploy
