"""Synthetic recall formats; no source text or source contacts."""
import pytest
from services.external_freight_classifier import classify_message
from services.external_freight_parser import map_selected_message, map_selected_messages

def raw(text):
    return dict(source_id="fixture",source_message=1,source_date=1792680000,text=text)

@pytest.mark.parametrize("route,a,b", [
    ("Магнитогорск-Ташкент","Магнитогорск","Ташкент"),
    ("🇺🇿parkent-moskva🇷🇺","parkent","moskva"),
    ("Москва—Алматы","Москва","Алматы"),
    ("🇷🇺Москва -- Алматы🇰🇿","Москва","Алматы"),
    ("Санкт-Петербург-Алматы","Санкт-Петербург","Алматы"),
])
def test_compact_city_pair_with_explicit_intent(route,a,b):
    item=map_selected_message(raw(route+"\nГруз готов\n21 тонна"))
    assert (item["status"],item["kind"],item["origin"],item["destination"])==("active","cargo",a,b)
    assert item["original_text"].startswith(route)
    assert item["source_published_at"]=="2026-10-22T14:40:00+00:00"


def test_known_city_pair_without_arrow_or_dash_is_a_route():
    item=map_selected_message(raw('Груз готов\nХоргос Астана\n87051743567'))
    assert (item['status'],item['kind'],item['origin'],item['destination']) == (
        'active','cargo','Хоргос','Астана')
    assert item['contacts']==['87051743567']

@pytest.mark.parametrize("label",["Груз📦 доски","📦 Груз - шины","ЮК ТАЙЙОР","ЮК ТАЙЁР"])
def test_explicit_cargo_labels(label):
    assert classify_message(label+"\nАлматы → Москва")["kind"]=="cargo"

def test_empty_tow_truck_is_vehicle_not_cargo():
    item=map_selected_message(raw("Ростов Москва\nПустой эвакуатор"))
    assert (item["kind"],item["status"])==("vehicle","active")

@pytest.mark.parametrize("text",[
    "Пустой эвакуатор нужен", "Пустой эвакуатор?","Пустой эвакуатор продаётся",
    "Пустой эвакуатор в ремонте","Пустой эвакуатор не свободен",
    "Если пустой эвакуатор звоните",
])
def test_unconfirmed_or_unavailable_vehicle_stays_review(text):
    assert map_selected_message(raw("Ростов Москва\n"+text))["status"]=="review"

@pytest.mark.parametrize("route",[
    "Санкт-Петербург","Ростов-на-Дону","Усть-Каменогорск",
    "Москва или Алматы","Москва/Алматы","Москва Алматы Астана",
    "Срочно Москва Алматы", "Москва-Неизвестное", "Авто-Тент",
])
def test_not_a_confirmed_pair(route):
    assert map_selected_message(raw(route+"\nГруз готов"))["status"]=="review"

def test_compact_bulk_keeps_contact_ownership():
    items=map_selected_messages(raw("Москва-Алматы\nГруз - шины\n+77000000001\nАстана-Бишкек\nГруз📦 доски"))
    assert len(items)==2 and all(x["status"]=="active" for x in items)
    assert items[0]["contacts"]==["+77000000001"] and items[1]["contacts"]==[]

def test_shared_header_stays_review():
    items=map_selected_messages(raw("Общий контакт: +77000000001\nМосква-Алматы\nГруз - шины\nАстана-Бишкек\nГруз📦 доски"))
    assert len(items)==1 and items[0]["status"]=="review"

def test_promotion_without_load_or_offer_is_not_published():
    assert map_selected_message(raw("Ростов Москва\nПоможем найти груз! Пишите нам"))["status"]=="review"


@pytest.mark.parametrize("route", ["Москва-Алматы?", "Москва-Алматы❓", "Москва-Алматы/"])
def test_question_or_alternative_is_not_a_confirmed_compact_route(route):
    assert map_selected_message(raw(route+"\nГруз - шины"))["status"]=="review"

def test_mixed_arrow_and_compact_routes_are_separate_requests():
    text="Москва → Алматы\nГруз - шины\nАстана-Бишкек\nГруз📦 доски"
    assert map_selected_message(raw(text))["status"]=="review"
    items=map_selected_messages(raw(text))
    assert len(items)==2 and all(x["status"]=="active" for x in items)
    assert [(x["origin"],x["destination"]) for x in items]==[("Москва","Алматы"),("Астана","Бишкек")]
