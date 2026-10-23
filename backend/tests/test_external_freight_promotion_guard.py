"""Обезличенные регрессии полного исторического census, без рабочих БД."""
import pytest
from services.external_freight_classifier import classify_message
from services.external_freight_parser import map_selected_message


def raw(text):
    return {'source':'approved_source','source_id':'fixture','source_message':1,
            'source_date':1792750000,'text':text,'phones':[]}


@pytest.mark.parametrize('text', [
    'Example.com — международная биржа перевозок\nБыстро находите грузы, свободный транспорт и партнёров. Регистрируйтесь!',
    'Example.com — новые и обратные грузы\nРазмещать заявки на грузы и свободный транспорт',
    'Example.com — международная биржа\nБыстрый поиск свободного транспорта\nНаходите свободный транспорт на нашей платформе!',
])
def test_promotional_search_is_not_a_vehicle_offer(text):
    assert classify_message(text)['kind'] is None
    assert classify_message(text)['reason']=='promotional_content'
    assert map_selected_message(raw(text))['status']=='review'


@pytest.mark.parametrize('offer', ['Свободный транспорт','Ищу груз','Есть машина'])
def test_real_vehicle_offer_survives_promotional_footer(offer):
    text=offer+'\nАлматы → Москва\nНаходите свободный транспорт на нашей платформе!'
    item=map_selected_message(raw(text))
    assert (item['kind'],item['status'])==('vehicle','active')
    assert item['original_text']==text


def test_empty_tow_truck_survives_unrelated_promotional_footer():
    item=map_selected_message(raw('Ростов Москва\nПустой эвакуатор\nИщите свободный транспорт на бирже!'))
    assert (item['kind'],item['status'])==('vehicle','active')


@pytest.mark.parametrize('route', ['Example.com → Алматы','Алматы → Example.ru','https://example.com → Алматы','Example.biz → Алматы','Example.app → Алматы','пример.рф → Алматы'])
def test_web_domain_is_not_a_route_endpoint(route):
    assert map_selected_message(raw('Груз готов\n'+route))['status']=='review'


def test_literal_city_abbreviation_is_not_treated_as_domain():
    assert map_selected_message(raw('Груз готов\nг.Москва → Алматы'))['status']=='active'


def test_literal_st_city_is_not_treated_as_domain():
    assert map_selected_message(raw('Груз готов\nSt.Louis → Алматы'))['status']=='active'


def test_first_person_search_for_cargo_is_still_an_offer():
    item=map_selected_message(raw('В поиске груза, есть машина\nАлматы → Москва'))
    assert (item['kind'],item['status'])==('vehicle','active')


@pytest.mark.parametrize('marker',['📲','☎️','📞️'])
def test_explicit_phone_icon_preserves_local_number(marker):
    item=map_selected_message(raw('Есть машина\nАлматы → Москва\n'+marker+'901234567'))
    assert item['contacts']==['901234567']


def test_phone_icon_does_not_override_explicit_price():
    item=map_selected_message(raw('Есть машина\nАлматы → Москва\n📲 Цена 901234567 KZT'))
    assert item['contacts']==[]


@pytest.mark.parametrize('price',['Narx:Kelishiladi','Нарх: келишилади'])
def test_explicit_negotiable_price_is_not_unknown_or_zero(price):
    item=map_selected_message(raw('Yuk kerak\nToshkentdan Nukusga\n'+price))
    assert item['price_state']=='negotiable'
    assert item['amount'] is None and item['currency'] is None


def test_negative_price_word_is_not_assumed_negotiable():
    item=map_selected_message(raw('Yuk kerak\nToshkentdan Nukusga\nNarx:Kelishilmaydi'))
    assert item['price_state']=='unknown'
