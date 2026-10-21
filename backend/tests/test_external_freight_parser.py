from datetime import datetime, timezone

from services.external_freight_parser import map_selected_message


def _queue(text, **extra):
    return {
        "source": "approved-source",
        "source_id": "channel-1",
        "id": "message-7",
        "source_message": "telegram-message-88",
        "text": text,
        "source_date": datetime(2026, 10, 21, tzinfo=timezone.utc).timestamp(),
        "phones": '["+7 700 123 45 67"]',
        "status": "published",
        **extra,
    }


def test_maps_explicit_cargo_fields_and_keeps_original_text_and_contact():
    text = (
        "Нужен тент, груз готов\nХоргос → Алматы\n"
        "Груз: электросамокаты\n25 т, 150 м³\nПогрузка: 25.10.2026\n4 500 USD"
    )
    item = map_selected_message(_queue(text))
    assert item["kind"] == "cargo"
    assert item["status"] == "active"
    assert item["origin"] == "Хоргос"
    assert item["destination"] == "Алматы"
    assert item["cargo_name"] == "электросамокаты"
    assert item["body_types"] == ["tent"]
    assert item["weight"] == 25
    assert item["volume"] == 150
    assert item["loading_date"] == "25.10.2026"
    assert item["amount"] == 4500
    assert item["currency"] == "USD"
    assert item["contacts"] == ["+7 700 123 45 67"]
    assert item["original_text"] == text
    assert item["source_message_id"] == "telegram-message-88"
    assert item["source_published_at"].startswith("2026-10-21T00:00:00")


def test_price_missing_and_negotiable_are_distinct():
    unknown = map_selected_message(_queue("Нужен тент, груз готов\nХоргос → Алматы"))
    negotiable = map_selected_message(_queue("Нужен тент, груз готов\nХоргос → Алматы\nЦена договорная"))
    assert (unknown["amount"], unknown["currency"], unknown["price_state"]) == (None, None, "unknown")
    assert (negotiable["amount"], negotiable["currency"], negotiable["price_state"]) == (None, None, "negotiable")


def test_unlabelled_date_is_not_assumed_to_be_loading_date():
    item = map_selected_message(_queue("Нужен тент, груз готов\nХоргос → Алматы\n25.10.2026"))
    assert item["loading_date"] is None


def test_ambiguous_or_multi_request_text_stays_review_without_shared_contact():
    item = map_selected_message(_queue("Нужен тент, груз готов\nЕсть свободный реф\nХоргос → Алматы"))
    assert item["status"] == "review"
    # The contact stays attached to the review item, never to a public card.
    assert item["contacts"] == ["+7 700 123 45 67"]


def test_unknown_currency_and_unlabelled_route_are_not_guessed():
    item = map_selected_message(_queue("Нужен тент, груз готов\nХоргос Алматы\n4 500 ABC"))
    assert item["origin"] is None
    assert item["destination"] is None
    assert item["amount"] is None
    assert item["currency"] is None


def test_ambiguous_price_invalid_date_and_multiple_routes_stay_unpublished_or_unknown():
    price = map_selected_message(_queue("Нужен тент, груз готов\nХоргос → Алматы\n4,500 USD"))
    invalid_date = map_selected_message(_queue("Нужен тент, груз готов\nХоргос → Алматы\n32.13.2026"))
    multi_route = map_selected_message(_queue("Нужен тент, груз готов\nХоргос → Алматы\nТашкент → Астана"))
    assert price["amount"] is None and price["price_state"] == "unknown"
    assert invalid_date["loading_date"] is None
    assert multi_route["status"] == "review"
    assert multi_route["origin"] is None and multi_route["destination"] is None
    assert multi_route["contacts"] == []
