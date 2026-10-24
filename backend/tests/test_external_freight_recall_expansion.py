from datetime import datetime, timezone

from services.external_freight_classifier import classify_message
from services.external_freight_parser import map_selected_message, map_selected_messages


def _raw(text, **extra):
    return {
        "source": "approved-source",
        "source_id": "channel-1",
        "id": "message-9",
        "source_message": "telegram-message-99",
        "text": text,
        "source_date": datetime(2026, 10, 24, tzinfo=timezone.utc).timestamp(),
        "phones": "[]",
        "status": "published",
        **extra,
    }


def test_expanded_cargo_intent_recognizes_transport_and_freight_phrases():
    for phrase in ("Ищу фуру для перевозки", "Нужна перевозка груза", "Грузоперевозка"):
        result = classify_message(f"{phrase}\nАлматы → Ташкент\nТент, 20 т")
        assert result["kind"] == "cargo"
        assert result["status"] == "active"


def test_expanded_vehicle_intent_recognizes_direct_carrier_offers():
    for phrase in ("Предлагаю машину", "Располагаю фурой", "Машина свободна",
                   "Есть машина, Хоргос-Алматы", "Предлагаю тент", "В наличии тягач"):
        result = classify_message(f"{phrase}\nАлматы → Ташкент\nТент, 20 т")
        assert result["kind"] == "vehicle"
        assert result["status"] == "active"


def test_empty_container_transport_alone_is_not_a_free_vehicle_offer():
    result = classify_message("Порожний контейнер нужно перевезти\nАлматы → Ташкент")
    assert result["kind"] != "vehicle"


def test_parser_recovers_formatted_and_labelled_phones_missing_from_metadata():
    formatted = map_selected_message(_raw(
        "Нужен тент, груз готов\nАлматы → Ташкент\n20 т\n707 123 45 67"
    ))
    labelled = map_selected_message(_raw(
        "Нужен тент, груз готов\nАлматы → Ташкент\nТелефон: 87071234567"
    ))
    assert formatted["contacts"] == ["707 123 45 67"]
    assert labelled["contacts"] == ["87071234567"]


def test_measurements_prices_dates_and_unlabelled_identifiers_are_not_contacts():
    item = map_selected_message(_raw(
        "Нужен тент, груз готов\nАлматы → Ташкент\n20 т, 92 м3, 26.10.2026\n"
        "Цена 4500 USD\nID 12345678901"
    ))
    assert item["contacts"] == []


def test_split_requests_keep_each_route_price_and_phone_inside_its_block():
    text = (
        "1) Нужен тент, груз готов\nАлматы → Ташкент\nЦена 1200 USD\nТелефон: +7 707 111 22 33\n"
        "2) Нужен реф, груз готов\nАстана → Бишкек\nЦена 1800 USD\nТелефон: +7 707 444 55 66"
    )
    items = map_selected_messages(_raw(text))
    assert len(items) == 2
    assert [(item["origin"], item["destination"]) for item in items] == [
        ("Алматы", "Ташкент"), ("Астана", "Бишкек")
    ]
    assert [item["amount"] for item in items] == [1200, 1800]
    assert [item["contacts"] for item in items] == [
        ["+7 707 111 22 33"], ["+7 707 444 55 66"]
    ]
    assert all(item["kind"] == "cargo" and item["status"] == "active" for item in items)


def test_compact_routes_use_verified_city_pairs_and_preserve_hyphenated_names():
    compact = map_selected_message(_raw(
        "Нужна фура для перевозки\nТашкент-Бишкек\nГруз: оборудование"
    ))
    assert compact["status"] == "active"
    assert (compact["origin"], compact["destination"]) == ("Ташкент", "Бишкек")

    single_city = map_selected_message(_raw("Есть машина\nСанкт-Петербург\nТент, 20 т"))
    assert single_city["status"] == "review"
    assert single_city["origin"] is None and single_city["destination"] is None
