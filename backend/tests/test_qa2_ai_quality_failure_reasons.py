"""Reason-code contract for the isolated QA2 translation quality gate."""
from qa_ai_service.quality import (
    _polarity,
    _numeric_facts,
    repair_logistics_translation,
    translation_quality_failures,
    translation_quality_ok,
)
from qa_ai_service.structured_tokens import (
    protect,
    restore,
    split_for_translation,
    translate_preserving_identifiers,
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


def test_plate_identifier_is_restored_byte_for_byte_after_nllb_translation():
    source = "Машина A123AA01 будет у Бахты завтра."
    protected = protect(source)
    assert protected.text == "Машина URTRUCKPROTECTEDTOKEN0X будет у Бахты завтра."
    # Regression from the physical QA2 run: without protection NLLB returned
    # `123A01`, dropping the leading letter.  Only the exact original token
    # may be restored into a successful translation.
    translated = "车辆 URTRUCKPROTECTEDTOKEN0X 明天到巴克图。"
    assert restore(translated, protected) == "车辆 A123AA01 明天到巴克图。"


def test_changed_or_dropped_plate_marker_fails_closed_instead_of_guessing():
    protected = protect("Госномер A123AA01.")
    assert restore("车牌 123A01。", protected) is None
    assert restore("车牌 URTRUCKPROTECTEDTOKEN0X и URTRUCKPROTECTEDTOKEN0X。", protected) is None


def test_translation_split_keeps_identifier_out_of_nllb_input_and_preserves_it_exactly():
    # Regression from the physical QA2 EN→ZH smoke: NLLB dropped the old
    # ASCII marker, causing ``structured_token_missing`` for a valid plate.
    # The production path now sends only prose to NLLB and splices the known
    # identifier back locally, so there is no marker for the model to lose.
    source = "Truck A123AA01 is at Bakhty."
    assert split_for_translation(source) == (
        (False, "Truck "),
        (True, "A123AA01"),
        (False, " is at Bakhty."),
    )
    prose = [value for is_identifier, value in split_for_translation(source) if not is_identifier]
    assert all("A123AA01" not in value for value in prose)
    assert "".join(("卡车", "A123AA01", "在巴克图。")) == "卡车A123AA01在巴克图。"


def test_nllb_route_keeps_sentence_context_and_appends_original_plate_exactly():
    """The live EN→ZH regression must not depend on NLLB copying a marker."""
    seen = []

    def fake_nllb(prose):
        seen.append(prose)
        return {"Truck is at Bakhty.": "卡车在巴克图。"}[prose]

    translated = translate_preserving_identifiers("Truck A123AA01 is at Bakhty.", fake_nllb)

    assert seen == ["Truck is at Bakhty."]
    assert translated == "卡车在巴克图。 A123AA01"


def test_plate_only_short_sentence_keeps_context_and_plate_byte_for_byte():
    """Second physical regression: a short EN sentence with one plate."""
    seen = []

    def fake_nllb(prose):
        seen.append(prose)
        return {"Truck.": "卡车。"}[prose]

    translated = translate_preserving_identifiers("Truck A123AA01.", fake_nllb)

    assert seen == ["Truck."]
    assert translated == "卡车。 A123AA01"


def test_exact_qa2_english_truck_regressions_repair_only_known_prose():
    """Observed NLLB hallucination must not reach the user or alter the plate."""
    assert repair_logistics_translation(
        "Truck.", "卡车这里是我的家。", "en", "zh"
    ) == "卡车。"
    assert repair_logistics_translation(
        "Truck is at Bakhty.", "这里是我的家。", "en", "zh"
    ) == "卡车在巴克图。"


def test_container_and_document_identifiers_are_opaque_tokens_too():
    source = "KZ 777 ABC 02; MSCU1234567; TGHU7654321; 20GP; 40HC; CMR-2026-001; INV-77821; PL-2026-09."
    protected = protect(source)
    assert protected.text == (
        "URTRUCKPROTECTEDTOKEN0X; URTRUCKPROTECTEDTOKEN1X; URTRUCKPROTECTEDTOKEN2X; "
        "URTRUCKPROTECTEDTOKEN3X; URTRUCKPROTECTEDTOKEN4X; URTRUCKPROTECTEDTOKEN5X; "
        "URTRUCKPROTECTEDTOKEN6X; URTRUCKPROTECTEDTOKEN7X."
    )
    translated = (
        "URTRUCKPROTECTEDTOKEN0X；URTRUCKPROTECTEDTOKEN1X；URTRUCKPROTECTEDTOKEN2X；"
        "URTRUCKPROTECTEDTOKEN3X；URTRUCKPROTECTEDTOKEN4X；URTRUCKPROTECTEDTOKEN5X；"
        "URTRUCKPROTECTEDTOKEN6X；URTRUCKPROTECTEDTOKEN7X。"
    )
    assert restore(translated, protected) == (
        "KZ 777 ABC 02；MSCU1234567；TGHU7654321；20GP；40HC；CMR-2026-001；INV-77821；PL-2026-09。"
    )


def test_structured_money_weight_volume_range_date_and_time_keep_their_facts():
    source = "Цена 12 500 USD, 0.4%, 18 000 кг, 90 м³, 5–10 машин, 02.10.2026 в 15:30."
    good = "价格 12500 USD、0.4%、18000 千克、90 立方米、5–10 辆车，2026年10月2日 15:30。"
    bad = "价格 12500 USD、0.95%、18000 千克、105 立方米、5–10 辆车，2026年10月2日 15:30。"
    assert translation_quality_failures(source, good, "ru", "zh") == []
    assert "numeric_facts_changed" in translation_quality_failures(source, bad, "ru", "zh")


def test_textual_day_month_and_weekday_are_compared_as_logistics_facts():
    assert translation_quality_failures("Погрузка 2 октября.", "装货日期为10月2日。", "ru", "zh") == []
    assert "numeric_facts_changed" in translation_quality_failures("Погрузка 2 октября.", "装货日期为10月3日。", "ru", "zh")
    assert translation_quality_failures("Monday loading.", "星期一装货。", "en", "zh") == []
    assert "weekday_missing:monday" in translation_quality_failures("Monday loading.", "星期二装货。", "en", "zh")


def test_allowlisted_cross_border_locations_cannot_silently_disappear():
    source = "Алматы → Урумчи через Бахты и Алашанькоу, Kazakhstan, Germany."
    good = "阿拉木图→乌鲁木齐，经巴克图和阿拉山口，哈萨克斯坦，德国。"
    missing = "阿拉木图→乌鲁木齐。"
    assert translation_quality_failures(source, good, "ru", "zh") == []
    failures = translation_quality_failures(source, missing, "ru", "zh")
    for place in ("bakhty", "alashankou", "kazakhstan", "germany"):
        assert f"city_missing:{place}" in failures


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
