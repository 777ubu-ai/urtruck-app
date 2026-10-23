import pytest
from services.external_freight_classifier import classify_message
from services.external_freight_parser import map_selected_message, map_selected_messages


def raw(text):
    return dict(source_id="fixture", source_message=1, source_date=1792740000, text=text)


@pytest.mark.parametrize("phrase", [
    "Пустая машина", "У меня пустая фура", "Есть пустой тент",
    "Fura bor", "Menda fura bor", "Фура бор",
])
def test_explicit_vehicle_offer(phrase):
    item = map_selected_message(raw(phrase + "\nАлматы → Москва"))
    assert (item["kind"], item["status"]) == ("vehicle", "active")


@pytest.mark.parametrize("phrase", [
    "Нужна пустая машина", "Ищу пустую фуру", "У кого пустая машина?",
    "Fura bor mi?", "Fura bor mi", "Fura bor?", "Пустая машина нужна",
    "Пустая машина на продажу", "Fura bor sotiladi",
    "Пустая машина уже занята", "Пустая машина не свободна", "Fura bor emas", "Fura bor yo'q",
])
def test_requests_questions_sales_not_promoted(phrase):
    assert classify_message(phrase + "\nАлматы → Москва")["status"] != "active"


@pytest.mark.parametrize("text,origin,destination", [
    ("Yuk kerak\nToshkentdan Moskvaga", "Toshkent", "Moskva"),
    ("Yuk kerak\nToshkentga", None, "Toshkent"),
    ("Menda fura bor\nSamarqanddan", "Samarqand", None),
    ("Жүк керек\nТошкентдан Москвага", "Тошкент", "Москва"),
    ("Yuk kerak\nTOSHKENTDAN MOSKVAGA", "TOSHKENT", "MOSKVA"),
    ("Yuk kerak\nFarg'onadan Toshkentga", "Farg'ona", "Toshkent"),
])
def test_explicit_uz_direction_keeps_literal_spelling(text, origin, destination):
    item = map_selected_message(raw(text))
    assert (item["kind"], item["status"]) == ("vehicle", "active")
    assert (item["origin"], item["destination"]) == (origin, destination)
    assert item["contacts"] == [] and item["amount"] is None
    assert item["original_text"] == text


@pytest.mark.parametrize("direction", [
    "Toshkentga Moskvaga", "Toshkentdan Samarqanddan Moskvaga",
    "mashinaga odamga", "Toshkent", "Noma'lumdan Noma'lumga",
    "Toshkentga bormayman", "Toshkentga emas", "Не еду Moskvaga", "Не из Toshkentdan",
])
def test_missing_or_ambiguous_direction_stays_review(direction):
    assert map_selected_message(raw("Yuk kerak\n" + direction))["status"] == "review"


def test_existing_arrow_route_wins_over_other_direction_text():
    item = map_selected_message(raw("Yuk kerak\nАлматы → Москва\nToshkentga"))
    assert (item["origin"], item["destination"]) == ("Алматы", "Москва")


def test_cargo_is_not_reclassified_from_uz_direction():
    item = map_selected_message(raw("Груз: оборудование\nToshkentdan Moskvaga"))
    assert item["kind"] == "cargo" and item["status"] == "review"


def test_mixed_offer_and_cargo_keeps_review():
    item = map_selected_message(raw("Пустая фура\nГруз: оборудование\nАлматы → Москва"))
    assert item["status"] == "review"


def test_separate_blocks_keep_their_contacts():
    items = map_selected_messages(raw(
        "1. Fura bor\nToshkentdan Moskvaga\n+77000000001\n"
        "2. Пустая машина\nАлматы → Астана\n+77000000002"))
    assert len(items) == 2
    assert [x["status"] for x in items] == ["active", "active"]
    assert [x["contacts"] for x in items] == [["+77000000001"], ["+77000000002"]]


@pytest.mark.parametrize("text,origin,destination", [
    ("🇨🇳Uluĝchatdan\nFura bor 3ta\nYuk kerak", "Uluĝchat", None),
    ("‼Qarshi Kosondan‼\n‼Buxoroga‼\nYuk kerak", "Qarshi Koson", "Buxoro"),
    ("Toshkentdan Nukusga moshina bor tent fura yuk kerak temirmi ogʻir yuk kerak tel",
     "Toshkent", "Nukus"),
    ("Ташкент Масква\nРеф нужен груз", "Ташкент", "Масква"),
    ("Samarqand Toshkent\nYuk kerak", "Samarqand", "Toshkent"),
])
def test_short_verified_formats(text, origin, destination):
    item = map_selected_message(raw(text))
    assert (item["kind"], item["status"]) == ("vehicle", "active")
    assert (item["origin"], item["destination"]) == (origin, destination)


@pytest.mark.parametrize("text", [
    "Ташкент Масква\nАлматы Астана\nНужен груз",
    "Yuk kerak\nToshkentdan bormayman\nАлматы Москва",
    "Fura kerak\nYuk kerak\nToshkentdan Nukusga",
    "Fura bor — yuk kerakmi?\nToshkentdan Nukusga",
    ("Ташкент Масква\nРеф нужен груз\n" + "подборка разных объявлений\n" * 60),
])
def test_mixed_advertising_and_conflicting_routes_stay_review(text):
    assert map_selected_message(raw(text))["status"] == "review"


@pytest.mark.parametrize("text", ["Fura kerak", "Tent kerak", "Moshina kerak", "Mashina kerak"])
def test_uz_vehicle_requests_are_cargo(text):
    item = map_selected_message(raw(text + "\nАлматы → Москва"))
    assert (item["kind"], item["status"]) == ("cargo", "active")
