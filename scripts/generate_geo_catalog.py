# -*- coding: utf-8 -*-
"""Генератор shared/geo-catalog.json — ЕДИНОГО источника истины для
frontend (src/utils/geoCatalog.js) и backend (backend/services/geo_catalog.py).

Формат намеренно нормализован (§5 ТЗ):
  countries[]: { id, flag, names{ru,en,zh,kk}, region, order }
  locations[]: { id, country_id, type, names{ru,en,zh,kk}, aliases[], partner_country?, partner_name? }

location.type ∈ CITY | BORDER_CROSSING | LOGISTICS_HUB

`names.kk` заполняется только там, где есть canonical казахское написание
(§8: «KK → казахские, если canonical support присутствует»). Иначе ключ
отсутствует и resolver честно падает на RU — выдумывать транслит не будем.
`names.zh` заполняется там, где есть общепринятое китайское название.
"""
import json, unicodedata, re
from pathlib import Path

C = []   # countries
L = []   # locations

def country(cid, flag, ru, en, zh=None, kk=None, region='CIS'):
    names = {'ru': ru, 'en': en}
    if zh: names['zh'] = zh
    if kk: names['kk'] = kk
    C.append({'id': cid, 'flag': flag, 'names': names, 'region': region, 'order': len(C)})

def slug(country_id, en):
    s = unicodedata.normalize('NFKD', en).encode('ascii', 'ignore').decode()
    s = re.sub(r"[^a-zA-Z0-9]+", '-', s).strip('-').lower()
    return f"{country_id.lower()}-{s}"

def city(country_id, ru, en, zh=None, kk=None, aliases=()):
    _loc(country_id, 'CITY', ru, en, zh, kk, aliases)

def hub(country_id, ru, en, zh=None, kk=None, aliases=()):
    _loc(country_id, 'LOGISTICS_HUB', ru, en, zh, kk, aliases)

def border(country_id, ru, en, partner_country, partner_ru, zh=None, kk=None, aliases=()):
    e = _loc(country_id, 'BORDER_CROSSING', ru, en, zh, kk, aliases)
    e['partner_country'] = partner_country
    e['partner_name'] = partner_ru

def _loc(country_id, ltype, ru, en, zh, kk, aliases):
    names = {'ru': ru, 'en': en}
    if zh: names['zh'] = zh
    if kk: names['kk'] = kk
    e = {'id': slug(country_id, en), 'country_id': country_id, 'type': ltype,
         'names': names, 'aliases': sorted(set(aliases))}
    L.append(e)
    return e

# ══════════════════════════ COUNTRIES ══════════════════════════
# Корридор: CN/KZ сверху, затем СНГ/Кавказ, затем ЕС (§7 — один каталог,
# без отдельных UI-condition на каждую страну).
country('CN', '🇨🇳', 'Китай',        'China',       '中国',  'Қытай',      'ASIA')
country('KZ', '🇰🇿', 'Казахстан',    'Kazakhstan',  '哈萨克斯坦', 'Қазақстан', 'CIS')
country('UZ', '🇺🇿', 'Узбекистан',   'Uzbekistan',  '乌兹别克斯坦', 'Өзбекстан', 'CIS')
country('KG', '🇰🇬', 'Кыргызстан',   'Kyrgyzstan',  '吉尔吉斯斯坦', 'Қырғызстан','CIS')
country('RU', '🇷🇺', 'Россия',       'Russia',      '俄罗斯', 'Ресей',      'CIS')
country('BY', '🇧🇾', 'Беларусь',     'Belarus',     '白俄罗斯', 'Беларусь',  'CIS')
country('TJ', '🇹🇯', 'Таджикистан',  'Tajikistan',  '塔吉克斯坦', 'Тәжікстан', 'CIS')
country('TM', '🇹🇲', 'Туркменистан', 'Turkmenistan','土库曼斯坦', 'Түрікменстан','CIS')
country('AM', '🇦🇲', 'Армения',      'Armenia',     '亚美尼亚', 'Армения',   'CAUCASUS')
country('GE', '🇬🇪', 'Грузия',       'Georgia',     '格鲁吉亚', 'Грузия',    'CAUCASUS')
country('AZ', '🇦🇿', 'Азербайджан',  'Azerbaijan',  '阿塞拜疆',  'Әзірбайжан','CAUCASUS')
country('TR', '🇹🇷', 'Турция',       'Turkey',      '土耳其', 'Түркия',     'MIDDLE_EAST')
# ── Европа (§7): обязательный минимум + уже поддержанные ──
country('PL', '🇵🇱', 'Польша',       'Poland',      '波兰',   None, 'EUROPE')
country('DE', '🇩🇪', 'Германия',     'Germany',     '德国',   None, 'EUROPE')
country('NL', '🇳🇱', 'Нидерланды',   'Netherlands', '荷兰',   None, 'EUROPE')
country('BE', '🇧🇪', 'Бельгия',      'Belgium',     '比利时', None, 'EUROPE')
country('FR', '🇫🇷', 'Франция',      'France',      '法国',   None, 'EUROPE')
country('IT', '🇮🇹', 'Италия',       'Italy',       '意大利', None, 'EUROPE')
country('ES', '🇪🇸', 'Испания',      'Spain',       '西班牙', None, 'EUROPE')
country('CZ', '🇨🇿', 'Чехия',        'Czechia',     '捷克',   None, 'EUROPE')
country('AT', '🇦🇹', 'Австрия',      'Austria',     '奥地利', None, 'EUROPE')
country('HU', '🇭🇺', 'Венгрия',      'Hungary',     '匈牙利', None, 'EUROPE')
country('SK', '🇸🇰', 'Словакия',     'Slovakia',    '斯洛伐克', None,'EUROPE')
country('SI', '🇸🇮', 'Словения',     'Slovenia',    '斯洛文尼亚', None,'EUROPE')
country('LT', '🇱🇹', 'Литва',        'Lithuania',   '立陶宛', None, 'EUROPE')
country('LV', '🇱🇻', 'Латвия',       'Latvia',      '拉脱维亚', None,'EUROPE')
country('EE', '🇪🇪', 'Эстония',      'Estonia',     '爱沙尼亚', None,'EUROPE')
country('FI', '🇫🇮', 'Финляндия',    'Finland',     '芬兰',   None, 'EUROPE')
country('DK', '🇩🇰', 'Дания',        'Denmark',     '丹麦',   None, 'EUROPE')
country('SE', '🇸🇪', 'Швеция',       'Sweden',      '瑞典',   None, 'EUROPE')
country('RO', '🇷🇴', 'Румыния',      'Romania',     '罗马尼亚', None,'EUROPE')
country('BG', '🇧🇬', 'Болгария',     'Bulgaria',    '保加利亚', None,'EUROPE')
country('GR', '🇬🇷', 'Греция',       'Greece',      '希腊',   None, 'EUROPE')
print(f"countries: {len(C)}")
json.dump({'countries': C, 'locations': L}, open('/tmp/_stage1.json','w'), ensure_ascii=False)

# ══════════════════════════ LOCATIONS ══════════════════════════
# Китай — основные точки отгрузки
city('CN','Иу','Yiwu','义乌',aliases=['Yiwoo'])
city('CN','Гуанчжоу','Guangzhou','广州')
city('CN','Шэньчжэнь','Shenzhen','深圳')
city('CN','Шанхай','Shanghai','上海')
city('CN','Пекин','Beijing','北京',aliases=['Peking'])
city('CN','Ханчжоу','Hangzhou','杭州')
city('CN','Урумчи','Urumqi','乌鲁木齐',aliases=['Urumchi'])
city('CN','Алашанькоу','Alashankou','阿拉山口')
city('CN','Хоргос','Horgos','霍尔果斯',aliases=['Khorgos','Huoerguosi'])
city('CN','Чжэнчжоу','Zhengzhou','郑州')
city('CN','Сиань','Xian','西安',aliases=["Xi'an"])
city('CN','Чэнду','Chengdu','成都')
city('CN','Тяньцзинь','Tianjin','天津')
city('CN','Циндао','Qingdao','青岛')
city('CN','Чунцин','Chongqing','重庆')
city('CN','Кашгар','Kashgar','喀什',aliases=['Kashi'])
city('CN','Манчжурия','Manzhouli','满洲里')
city('CN','Нинбо','Ningbo','宁波')
city('CN','Фошань','Foshan','佛山')
hub('CN','Алашанькоу — сухой порт','Alashankou Dry Port','阿拉山口陆港')
hub('CN','Сухой порт Урумчи','Urumqi Dry Port','乌鲁木齐陆港')
# Казахстан (kk — canonical)
city('KZ','Алматы','Almaty','阿拉木图','Алматы')
city('KZ','Астана','Astana','阿斯塔纳','Астана',aliases=['Nur-Sultan','Nur Sultan'])
city('KZ','Шымкент','Shymkent','奇姆肯特','Шымкент')
city('KZ','Караганда','Karaganda','卡拉干达','Қарағанды')
city('KZ','Актобе','Aktobe','阿克托别','Ақтөбе')
city('KZ','Атырау','Atyrau','阿特劳','Атырау')
city('KZ','Усть-Каменогорск','Ust-Kamenogorsk','乌斯季卡缅诺戈尔斯克','Өскемен',aliases=['Oskemen'])
city('KZ','Павлодар','Pavlodar','巴甫洛达尔','Павлодар')
city('KZ','Семей','Semey','塞米','Семей')
city('KZ','Тараз','Taraz','塔拉兹','Тараз')
city('KZ','Костанай','Kostanay','科斯塔奈','Қостанай')
city('KZ','Кызылорда','Kyzylorda','克兹洛尔达','Қызылорда')
city('KZ','Уральск','Uralsk','乌拉尔斯克','Орал')
city('KZ','Актау','Aktau','阿克套','Ақтау')
city('KZ','Талдыкорган','Taldykorgan','塔尔迪库尔干','Талдықорған')
city('KZ','Хоргос','Khorgos KZ','霍尔果斯','Қорғас')
city('KZ','Достык','Dostyk','多斯特克','Достық')
hub('KZ','СЭЗ Хоргос — Восточные ворота','Khorgos Eastern Gate','霍尔果斯东大门','Қорғас Шығыс қақпасы')
# Погранпереходы CN ↔ KZ (стратегическая пятёрка)
border('KZ','Нур Жолы','Nur Zholy','CN','Хоргос','努尔卓勒','Нұр жолы',aliases=['Хоргос ↔ Нур Жолы','Khorgos Nur Zholy'])
border('KZ','Достык (КПП)','Dostyk Crossing','CN','Алашанькоу','多斯特克口岸','Достық (ӨБ)',aliases=['Алашанькоу ↔ Достык','Alashankou Dostyk'])
border('KZ','Бахты','Bakhty','CN','Чугучак','巴克图','Бақты',aliases=['Бахты ↔ Чугучак','Tacheng Bakhty'])
border('KZ','Майкапчагай','Maykapshagay','CN','Зимунай','吉木乃','Майқапшағай',aliases=['Jeminay Maykapshagay'])
border('KZ','Калжат','Kalzhat','CN','Дулаты','都拉塔','Қалжат',aliases=['Dulaty Kalzhat'])
# Россия
city('RU','Москва','Moscow','莫斯科')
city('RU','Санкт-Петербург','Saint Petersburg','圣彼得堡',aliases=['St Petersburg','Saint-Petersburg'])
city('RU','Новосибирск','Novosibirsk','新西伯利亚')
city('RU','Екатеринбург','Ekaterinburg','叶卡捷琳堡',aliases=['Yekaterinburg'])
city('RU','Казань','Kazan','喀山')
city('RU','Челябинск','Chelyabinsk','车里雅宾斯克')
city('RU','Самара','Samara','萨马拉')
city('RU','Омск','Omsk','鄂木斯克')
city('RU','Уфа','Ufa','乌法')
city('RU','Красноярск','Krasnoyarsk','克拉斯诺亚尔斯克')
city('RU','Воронеж','Voronezh','沃罗涅日')
city('RU','Волгоград','Volgograd','伏尔加格拉德')
city('RU','Ростов-на-Дону','Rostov-on-Don','顿河畔罗斯托夫',aliases=['Rostov'])
city('RU','Краснодар','Krasnodar','克拉斯诺达尔')
city('RU','Иркутск','Irkutsk','伊尔库茨克')
city('RU','Владивосток','Vladivostok','符拉迪沃斯托克')
city('RU','Новороссийск','Novorossiysk','新罗西斯克')
# СНГ / Кавказ
city('UZ','Ташкент','Tashkent','塔什干'); city('UZ','Самарканд','Samarkand','撒马尔罕')
city('UZ','Бухара','Bukhara','布哈拉'); city('UZ','Андижан','Andijan','安集延')
city('UZ','Фергана','Fergana','费尔干纳'); city('UZ','Нукус','Nukus','努库斯')
city('UZ','Термез','Termez','铁尔梅兹')
city('KG','Бишкек','Bishkek','比什凯克'); city('KG','Ош','Osh','奥什')
city('TJ','Душанбе','Dushanbe','杜尚别'); city('TJ','Худжанд','Khujand','苦盏')
city('TM','Ашхабад','Ashgabat','阿什哈巴德'); city('TM','Туркменбаши','Turkmenbashi','土库曼巴希')
city('BY','Минск','Minsk','明斯克'); city('BY','Брест','Brest','布列斯特')
border('BY','Брест (КПП)','Brest Crossing','PL','Тересполь','布列斯特口岸',aliases=['Brest Terespol'])
city('AM','Ереван','Yerevan','埃里温')
city('GE','Тбилиси','Tbilisi','第比利斯'); city('GE','Батуми','Batumi','巴统')
city('GE','Поти','Poti','波季'); hub('GE','Порт Поти','Poti Port','波季港')
city('AZ','Баку','Baku','巴库'); city('AZ','Гянджа','Ganja','占贾')
city('TR','Стамбул','Istanbul','伊斯坦布尔'); city('TR','Анкара','Ankara','安卡拉')
city('TR','Измир','Izmir','伊兹密尔'); city('TR','Мерсин','Mersin','梅尔辛')
hub('TR','Порт Мерсин','Mersin Port','梅尔辛港')
# Европа
city('PL','Варшава','Warsaw','华沙',aliases=['Warszawa'])
city('PL','Гданьск','Gdansk','格但斯克'); city('PL','Лодзь','Lodz','罗兹')
city('PL','Познань','Poznan','波兹南'); city('PL','Вроцлав','Wroclaw','弗罗茨瓦夫')
city('PL','Малашевичи','Malaszewicze','马拉舍维奇')
hub('PL','Малашевичи (терминал)','Malaszewicze Terminal','马拉舍维奇场站')
city('DE','Берлин','Berlin','柏林'); city('DE','Гамбург','Hamburg','汉堡')
city('DE','Дуйсбург','Duisburg','杜伊斯堡'); city('DE','Мюнхен','Munich','慕尼黑')
city('DE','Франкфурт-на-Майне','Frankfurt am Main','法兰克福',aliases=['Frankfurt'])
city('DE','Кёльн','Cologne','科隆',aliases=['Koln'])
city('DE','Штутгарт','Stuttgart','斯图加特'); city('DE','Лейпциг','Leipzig','莱比锡')
city('DE','Бремен','Bremen','不来梅')
hub('DE','Дуйсбург — порт Duisport','Duisport Terminal','杜伊斯堡港')
city('NL','Амстердам','Amsterdam','阿姆斯特丹'); city('NL','Роттердам','Rotterdam','鹿特丹')
city('NL','Эйндховен','Eindhoven','埃因霍温'); city('NL','Тилбург','Tilburg','蒂尔堡')
hub('NL','Порт Роттердам','Port of Rotterdam','鹿特丹港')
city('BE','Брюссель','Brussels','布鲁塞尔'); city('BE','Антверпен','Antwerp','安特卫普')
city('BE','Гент','Ghent','根特'); city('BE','Льеж','Liege','列日')
hub('BE','Порт Антверпен','Port of Antwerp','安特卫普港')
city('FR','Париж','Paris','巴黎'); city('FR','Лион','Lyon','里昂')
city('FR','Марсель','Marseille','马赛'); city('FR','Лилль','Lille','里尔')
city('FR','Гавр','Le Havre','勒阿弗尔')
city('IT','Милан','Milan','米兰'); city('IT','Рим','Rome','罗马')
city('IT','Генуя','Genoa','热那亚'); city('IT','Турин','Turin','都灵')
city('IT','Верона','Verona','维罗纳'); city('IT','Неаполь','Naples','那不勒斯')
city('ES','Мадрид','Madrid','马德里'); city('ES','Барселона','Barcelona','巴塞罗那')
city('ES','Валенсия','Valencia','瓦伦西亚'); city('ES','Сарагоса','Zaragoza','萨拉戈萨')
city('ES','Бильбао','Bilbao','毕尔巴鄂')
city('CZ','Прага','Prague','布拉格'); city('CZ','Брно','Brno','布尔诺')
city('CZ','Острава','Ostrava','俄斯特拉发')
city('AT','Вена','Vienna','维也纳'); city('AT','Линц','Linz','林茨')
city('AT','Грац','Graz','格拉茨')
city('HU','Будапешт','Budapest','布达佩斯'); city('HU','Дебрецен','Debrecen','德布勒森')
city('SK','Братислава','Bratislava','布拉迪斯拉发'); city('SK','Кошице','Kosice','科希策')
city('SI','Любляна','Ljubljana','卢布尔雅那'); city('SI','Копер','Koper','科佩尔')
hub('SI','Порт Копер','Port of Koper','科佩尔港')
city('LT','Вильнюс','Vilnius','维尔纽斯'); city('LT','Каунас','Kaunas','考纳斯')
city('LT','Клайпеда','Klaipeda','克莱佩达')
hub('LT','Каунасский ТКЛ','Kaunas Intermodal Terminal','考纳斯多式联运场站')
city('LV','Рига','Riga','里加'); city('LV','Лиепая','Liepaja','利耶帕亚')
city('EE','Таллин','Tallinn','塔林'); city('EE','Тарту','Tartu','塔尔图')
city('FI','Хельсинки','Helsinki','赫尔辛基'); city('FI','Котка','Kotka','科特卡')
city('FI','Турку','Turku','图尔库')
city('DK','Копенгаген','Copenhagen','哥本哈根'); city('DK','Орхус','Aarhus','奥胡斯')
city('SE','Стокгольм','Stockholm','斯德哥尔摩'); city('SE','Гётеборг','Gothenburg','哥德堡')
city('SE','Мальмё','Malmo','马尔默')
city('RO','Бухарест','Bucharest','布加勒斯特'); city('RO','Констанца','Constanta','康斯坦察')
city('BG','София','Sofia','索非亚'); city('BG','Варна','Varna','瓦尔纳')
city('GR','Афины','Athens','雅典'); city('GR','Пирей','Piraeus','比雷埃夫斯')
city('GR','Салоники','Thessaloniki','塞萨洛尼基')

# ── целостность ──
ids = [e['id'] for e in L]
assert len(ids) == len(set(ids)), [i for i in ids if ids.count(i) > 1]
cids = {c['id'] for c in C}
for e in L:
    assert e['country_id'] in cids, e
    if e.get('partner_country'): assert e['partner_country'] in cids, e
payload = {'version': 1, 'countries': C, 'locations': L}
body = json.dumps(payload, ensure_ascii=False, indent=2)

# JSON — для backend (backend/services/geo_catalog.py).
Path('shared/geo-catalog.json').write_text(body + '\n', encoding='utf-8')

# Деплой-копия ВНУТРИ backend/. Прод-деплой (secure-production-deploy.yml)
# копирует только `backend/*` в BACKEND_DIR — shared/ на сервере не существует,
# и без этой копии canonical-resolve падал FileNotFoundError на первом же
# create_cargo/create_trip (health-check при этом зелёный: импорт ленивый).
# Файл КОММИТИТСЯ в репозиторий; синхронность всех трёх артефактов защищает
# backend/tests/test_geo_catalog_artifacts_sync.py.
Path('backend/data').mkdir(parents=True, exist_ok=True)
Path('backend/data/geo-catalog.json').write_text(body + '\n', encoding='utf-8')

# JS-модуль — для frontend. Отдельный файл, а не import JSON, потому что
# Metro и строгий ESM-резолвер Node по-разному относятся к JSON-импортам
# (Node требует import attribute `with { type: 'json' }`, который Babel/Hermes
# в этом проекте не гарантируют). Оба артефакта генерируются ОДНИМ скриптом,
# поэтому разъехаться не могут.
Path('src/utils/geoCatalogData.js').write_text(
    '// АВТОГЕНЕРАЦИЯ — не редактировать руками.\n'
    '// Источник: scripts/generate_geo_catalog.py\n'
    '// Обновить: python3 scripts/generate_geo_catalog.py\n'
    '// Парный артефакт для backend: shared/geo-catalog.json\n'
    '/* eslint-disable */\n'
    f'export default {body};\n',
    encoding='utf-8')
from collections import Counter
print('countries:', len(C), '| locations:', len(L), '|', dict(Counter(e['type'] for e in L)))
print('стран с городами:', len({e["country_id"] for e in L}))
