// Geography registry — countries, point types, structured route points.
//
// Stage 7 introduces an explicit picker shape:  country → type → point.
// Earlier the CityInput used a single flat list of cities. The new
// registry below describes WHAT a point is (city / border / terminal /
// hub), which lets the picker show the right options and lets the
// backend (eventually) reason about route segments.
//
// Design notes:
//   * `name` is the user-visible label in Russian (the system language
//     of the marketplace). Aliases capture transliterations and the
//     foreign-side spelling so search finds them even when typed in
//     a different language.
//   * `partner` on a border crossing is the matching point on the
//     other side. We use it both for visualisation ("Хоргос → Нур Жолы")
//     and for graph queries (eventual "find all KZ ↔ CN borders").
//   * Backwards compatibility: the picker emits a free-form string
//     containing only the point name so the existing backend that
//     only stores `from_city` keeps working unchanged. The richer
//     point object is also returned via the second arg to `onChange`
//     for screens that want it.

import { COUNTRY_CATALOG } from './countries.js';

// Route selectors and marketplace filters share the complete country catalog
// with vehicle, citizenship and profile selectors. Route-specific ordering and
// points live here; names and ISO identities do not.
export const COUNTRIES = Object.freeze(Object.fromEntries(COUNTRY_CATALOG.map((country) => [
  country.iso,
  { name: country.names.RU, names: country.names },
])));

// Stable order in pickers — corridor matters: CN/KZ on top, then CIS,
// then EU.
const ROUTE_PRIORITY_COUNTRIES = [
  'CN', 'KZ', 'UZ', 'KG', 'RU', 'BY', 'TJ', 'TM',
  'AM', 'GE', 'AZ', 'TR',
  'PL', 'LT', 'LV', 'EE', 'HU', 'RO', 'SK', 'BG', 'GR',
];
export const COUNTRY_ORDER = [
  ...ROUTE_PRIORITY_COUNTRIES,
  ...COUNTRY_CATALOG.map((country) => country.iso).filter((iso) => !ROUTE_PRIORITY_COUNTRIES.includes(iso)),
];

// Point taxonomy. `key` is what we store internally; `label` /
// `description` are i18n strings the picker shows.
export const POINT_TYPES = [
  {
    key: 'city',
    icon: '🏙',
    labelKey: 'point_type_city',
    label: 'Город',
    description: 'Любой крупный город или населённый пункт',
  },
  {
    key: 'border',
    icon: '🛂',
    labelKey: 'point_type_border',
    label: 'Погранпереход',
    description: 'Пункт пропуска на границе двух стран',
  },
  {
    key: 'terminal',
    icon: '🏗',
    labelKey: 'point_type_terminal',
    label: 'Терминал / хаб',
    description: 'Логистический терминал или интермодальный хаб',
  },
];

// Helper: build a city entry. We expand here so the rest of the file
// reads tersely.
const c = (country, name, aliases = []) => ({
  country, type: 'city', name, aliases,
});

// Helper for border crossings — first side is the foreign/loading side,
// second side is Kazakhstan. The same record still shows in both country
// buckets through partnerCountry, but the visible label follows the
// working logistics direction into KZ.
const b = (a, b, aLabel, bLabel, aliases = []) => ({
  country: a, type: 'border',
  name: aLabel,
  partnerCountry: b, partner: bLabel,
  aliases,
});

// Helper for terminal/hub entries. Named `term` (not `t`) so the
// i18n smoke regex doesn't mistake the call site below for a
// translation key lookup. Keep the name `term`.
const term = (country, name, aliases = []) => ({
  country, type: 'terminal', name, aliases,
});

// Curated set, NOT exhaustive. Adding a city is just pushing one entry.
// Aliases include English spellings and any common transliterations —
// the search step lower-cases everything before comparing.
export const POINTS = [
  // ── China — major shipping origins ─────────────────────────────────
  c('CN', 'Иу',          ['Yiwu',     'Yiwoo']),
  c('CN', 'Гуанчжоу',    ['Guangzhou']),
  c('CN', 'Шэньчжэнь',   ['Shenzhen']),
  c('CN', 'Шанхай',      ['Shanghai']),
  c('CN', 'Пекин',       ['Beijing']),
  c('CN', 'Ханчжоу',     ['Hangzhou']),
  c('CN', 'Урумчи',      ['Urumqi', 'Urumchi']),
  c('CN', 'Алашанькоу',  ['Alashankou']),
  c('CN', 'Хоргос',      ['Khorgos', 'Huoerguosi']),
  c('CN', 'Чжэнчжоу',    ['Zhengzhou']),
  c('CN', 'Сиань',       ['Xian']),
  c('CN', 'Чэнду',       ['Chengdu']),
  c('CN', 'Тяньцзинь',   ['Tianjin']),
  c('CN', 'Циндао',      ['Qingdao']),
  c('CN', 'Чунцин',      ['Chongqing']),
  c('CN', 'Кашгар',      ['Kashgar', 'Kashi']),
  c('CN', 'Манчжурия',   ['Manzhouli']),
  // ── Kazakhstan ─────────────────────────────────────────────────────
  c('KZ', 'Алматы',         ['Almaty']),
  c('KZ', 'Астана',         ['Astana', 'Nur-Sultan']),
  c('KZ', 'Шымкент',        ['Shymkent']),
  c('KZ', 'Караганда',      ['Karaganda']),
  c('KZ', 'Актобе',         ['Aktobe']),
  c('KZ', 'Атырау',         ['Atyrau']),
  c('KZ', 'Усть-Каменогорск', ['Ust-Kamenogorsk', 'Oskemen']),
  c('KZ', 'Павлодар',       ['Pavlodar']),
  c('KZ', 'Семей',          ['Semey']),
  c('KZ', 'Тараз',          ['Taraz']),
  c('KZ', 'Костанай',       ['Kostanay']),
  c('KZ', 'Кызылорда',      ['Kyzylorda']),
  c('KZ', 'Уральск',        ['Uralsk']),
  c('KZ', 'Актау',          ['Aktau']),
  c('KZ', 'Талдыкорган',    ['Taldykorgan']),
  c('KZ', 'Хоргос',         ['Khorgos']),    // KZ-side name = same
  c('KZ', 'Достык',         ['Dostyk']),
  c('KZ', 'Бахты',          ['Bakhty']),
  c('KZ', 'Майкапчагай',    ['Maykapshagay']),
  c('KZ', 'Калжат',         ['Kalzhat']),
  // ── Border crossings China → Kazakhstan (the strategic five) ────
  b('CN', 'KZ', 'Хоргос → Нур Жолы',      'Нур Жолы',      ['Нур Жолы ↔ Хоргос', 'Хоргос ↔ Нур Жолы', 'Khorgos Nur Zholy']),
  b('CN', 'KZ', 'Алашанькоу → Достык',    'Достык',        ['Достык ↔ Алашанькоу', 'Алашанькоу ↔ Достык', 'Alashankou Dostyk']),
  b('CN', 'KZ', 'Чугучак → Бахты',        'Бахты',         ['Бахты ↔ Чугучак', 'Чугучак ↔ Бахты', 'Tacheng Bakhty']),
  b('CN', 'KZ', 'Зимунай → Майкапчагай',  'Майкапчагай',   ['Майкапчагай ↔ Зимунай', 'Зимунай ↔ Майкапчагай', 'Jeminay Maykapshagay']),
  b('CN', 'KZ', 'Дулаты → Калжат',        'Калжат',        ['Калжат ↔ Дулаты', 'Дулаты ↔ Калжат', 'Dulaty Kalzhat']),
  // ── Russia ─────────────────────────────────────────────────────────
  c('RU', 'Москва',          ['Moscow']),
  c('RU', 'Санкт-Петербург', ['Saint Petersburg', 'St Petersburg']),
  c('RU', 'Новосибирск',     ['Novosibirsk']),
  c('RU', 'Екатеринбург',    ['Ekaterinburg', 'Yekaterinburg']),
  c('RU', 'Казань',          ['Kazan']),
  c('RU', 'Челябинск',       ['Chelyabinsk']),
  c('RU', 'Самара',          ['Samara']),
  c('RU', 'Омск',            ['Omsk']),
  c('RU', 'Уфа',             ['Ufa']),
  c('RU', 'Красноярск',      ['Krasnoyarsk']),
  c('RU', 'Воронеж',         ['Voronezh']),
  c('RU', 'Волгоград',       ['Volgograd']),
  c('RU', 'Ростов-на-Дону',  ['Rostov-on-Don', 'Rostov']),
  c('RU', 'Краснодар',       ['Krasnodar']),
  c('RU', 'Иркутск',         ['Irkutsk']),
  c('RU', 'Владивосток',     ['Vladivostok']),
  // ── Other CIS ──────────────────────────────────────────────────────
  c('UZ', 'Ташкент',   ['Tashkent']),
  c('UZ', 'Самарканд', ['Samarkand']),
  c('UZ', 'Бухара',    ['Bukhara']),
  c('UZ', 'Андижан',   ['Andijan']),
  c('UZ', 'Фергана',   ['Fergana']),
  c('UZ', 'Нукус',     ['Nukus']),
  c('UZ', 'Термез',    ['Termez']),
  c('KG', 'Бишкек',    ['Bishkek']),
  c('KG', 'Ош',        ['Osh']),
  c('TJ', 'Душанбе',   ['Dushanbe']),
  c('TJ', 'Худжанд',   ['Khujand']),
  c('TM', 'Ашхабад',   ['Ashgabat']),
  c('TM', 'Туркменбаши', ['Turkmenbashi']),
  c('BY', 'Минск',     ['Minsk']),
  c('BY', 'Брест',     ['Brest']),
  c('AM', 'Ереван',    ['Yerevan']),
  c('GE', 'Тбилиси',   ['Tbilisi']),
  c('GE', 'Батуми',    ['Batumi']),
  c('GE', 'Поти',      ['Poti']),  // Black Sea port — major maritime gateway
  c('AZ', 'Баку',      ['Baku']),
  c('AZ', 'Гянджа',    ['Ganja']),
  // ── Europe ─────────────────────────────────────────────────────────
  c('PL', 'Варшава',   ['Warsaw', 'Warszawa']),
  c('PL', 'Гданьск',   ['Gdansk']),
  c('PL', 'Лодзь',     ['Lodz']),
  c('PL', 'Познань',   ['Poznan']),
  c('PL', 'Малашевичи',['Malaszewicze']),  // also a terminal — see below
  c('LT', 'Вильнюс',   ['Vilnius']),
  c('LT', 'Каунас',    ['Kaunas']),
  c('LT', 'Клайпеда',  ['Klaipeda']),
  c('LV', 'Рига',      ['Riga']),
  c('LV', 'Лиепая',    ['Liepaja']),
  c('EE', 'Таллин',    ['Tallinn']),
  c('HU', 'Будапешт',  ['Budapest']),
  c('RO', 'Бухарест',  ['Bucharest']),
  c('RO', 'Констанца', ['Constanta']),
  c('SK', 'Братислава',['Bratislava']),
  c('SK', 'Кошице',    ['Kosice']),
  c('TR', 'Стамбул',   ['Istanbul']),
  c('TR', 'Анкара',    ['Ankara']),
  c('TR', 'Измир',     ['Izmir']),
  c('TR', 'Мерсин',    ['Mersin']),
  c('TR', 'Ризе',      ['Rize']),
  c('BG', 'София',     ['Sofia']),
  c('BG', 'Варна',     ['Varna']),
  c('GR', 'Афины',     ['Athens']),
  c('GR', 'Пирей',     ['Piraeus']),
  c('GR', 'Салоники',  ['Thessaloniki']),

  // ── Europe — capitals for the complete shared country catalog ─────
  c('GB', 'Лондон', ['London']), c('IE', 'Дублин', ['Dublin']),
  c('DK', 'Копенгаген', ['Copenhagen']), c('NO', 'Осло', ['Oslo']),
  c('SE', 'Стокгольм', ['Stockholm']), c('FI', 'Хельсинки', ['Helsinki']),
  c('IS', 'Рейкьявик', ['Reykjavik']),
  c('DE', 'Берлин', ['Berlin']), c('FR', 'Париж', ['Paris']), c('AT', 'Вена', ['Vienna']),
  c('BE', 'Брюссель', ['Brussels']), c('NL', 'Амстердам', ['Amsterdam']),
  c('LU', 'Люксембург', ['Luxembourg']), c('CH', 'Берн', ['Bern']),
  c('LI', 'Вадуц', ['Vaduz']), c('MC', 'Монако', ['Monaco']),
  c('IT', 'Рим', ['Rome']), c('ES', 'Мадрид', ['Madrid']),
  c('PT', 'Лиссабон', ['Lisbon']), c('VA', 'Ватикан', ['Vatican City']),
  c('SM', 'Сан-Марино', ['San Marino']), c('MT', 'Валлетта', ['Valletta']),
  c('CY', 'Никосия', ['Nicosia']), c('AL', 'Тирана', ['Tirana']),
  c('AD', 'Андорра-ла-Велья', ['Andorra la Vella']),
  c('SI', 'Любляна', ['Ljubljana']), c('HR', 'Загреб', ['Zagreb']),
  c('BA', 'Сараево', ['Sarajevo']), c('RS', 'Белград', ['Belgrade']),
  c('ME', 'Подгорица', ['Podgorica']), c('MK', 'Скопье', ['Skopje']),
  c('UA', 'Киев', ['Kyiv', 'Kiev']), c('CZ', 'Прага', ['Prague']),
  c('MD', 'Кишинёв', ['Chisinau', 'Chișinău']),

  // ── Logistics terminals / multimodal hubs ──────────────────────────
  // Малашевичи — primary EU rail terminal for China–Europe routes.
  // We list it BOTH as a city (so people typing "Малашевичи" find it
  // on autocomplete) and as a terminal (so the structured picker
  // surfaces it under Польша → Терминал).
  term('PL', 'Малашевичи (терминал)', ['Malaszewicze terminal', 'Małaszewicze']),
  term('PL', 'Хелм (Chelm)',          ['Chelm']),
  term('LT', 'Каунасский ТКЛ',        ['Kaunas Intermodal Terminal']),
  term('KZ', 'СЭЗ Хоргос-Восточные ворота', ['Khorgos Eastern Gate']),
  term('CN', 'Алашанькоу-сухой порт', ['Alashankou Dry Port']),
  term('CN', 'Сухой порт Урумчи',     ['Urumqi Dry Port']),
  term('GE', 'Порт Поти',             ['Poti Port']),
  term('TR', 'Порт Мерсин',           ['Mersin Port']),
];

// Search across all visible label surfaces (name + aliases + country
// name). Empty query returns top 12 entries to keep the UI fast.
export const searchPoints = (query, { country, type } = {}) => {
  let pool = POINTS;
  if (country) pool = pool.filter((p) => p.country === country || p.partnerCountry === country);
  if (type) pool = pool.filter((p) => p.type === type);
  if (!query || !query.trim()) return pool.slice(0, 12);
  const q = query.toLowerCase().trim();
  const hits = pool.filter((p) => {
    if (p.name.toLowerCase().includes(q)) return true;
    if ((p.aliases || []).some((a) => a.toLowerCase().includes(q))) return true;
    const country = COUNTRIES[p.country];
    if (country && Object.values(country.names || { RU: country.name })
      .some((name) => String(name).toLowerCase().includes(q))) return true;
    return false;
  });
  hits.sort((a, b) => {
    const aStarts = a.name.toLowerCase().startsWith(q);
    const bStarts = b.name.toLowerCase().startsWith(q);
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;
    return a.name.localeCompare(b.name, 'ru');
  });
  return hits.slice(0, 12);
};

// Format a point object the way the legacy backend expects: "<name>,
// country metadata. When the user picks a border crossing we keep just the
// KZ-side label visible, but the partner spelling is kept on the
// `partner` field if a caller wants it.
export const formatPoint = (point) => {
  if (!point) return '';
  return point.name || '';
};

// Convenience: return only the points belonging to one country, useful
// for the picker's stage-2 list.
export const pointsForCountry = (countryCode, type = null) => {
  let pool = POINTS.filter((p) => p.country === countryCode || p.partnerCountry === countryCode);
  if (type) pool = pool.filter((p) => p.type === type);
  return pool;
};
