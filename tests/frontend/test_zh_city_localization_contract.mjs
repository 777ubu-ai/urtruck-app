/**
 * P1-A (final release gate, 04.09.2026) — Regression: ZH city/route resolver.
 *
 * ФИЗИЧЕСКИЙ ФАКТ: Boris в китайском интерфейсе видел маршрут как
 * «Almaty / Moscow» вместо «阿拉木图 / 莫斯科».
 *
 * ROOT CAUSE (доказан прогоном резолвера): DICT в utils/places.js индексирован
 * ТОЛЬКО русскими ключами, а production хранит точки маршрута как есть — в том
 * числе латиницей. localizePlace() искал `DICT[raw]`, поэтому 'Almaty' не
 * находился и возвращался без изменений — на КАЖДОМ экране, который показывает
 * маршрут (карточка груза, деталь, список сделок, шапка Deal Room/чата,
 * TripDetail, сводка карты, фильтр пушей). Предыдущий заход починил только
 * резолвер ТЕКСТА УВЕДОМЛЕНИЙ (localizeKnownPlacesInText), а экранный
 * localizePlace остался старым — отсюда «фикс есть, а физически не работает».
 *
 * ФИКС: один канонический индекс PLACE_KEY_BY_ALIAS (русский ключ + en-форма +
 * zh-форма + реальные транслитерации) внутри того же резолвера. Никаких
 * per-screen патчей.
 *
 * Run: node tests/frontend/test_zh_city_localization_contract.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf-8');

let passed = 0;
let failed = 0;
function expect(cond, msg) {
  if (cond) { console.log(`  ✅ ${msg}`); passed++; }
  else { console.error(`  ❌ FAIL: ${msg}`); failed++; }
}

const places = await import(path.join(ROOT, 'src/utils/places.js'));
const placesSrc = read('src/utils/places.js');

console.log('\n=== 1. РЕПРО физического фейла: locale=zh, origin=Almaty, destination=Moscow ===');
{
  // Ровно то, что видел Boris. До фикса возвращалось 'Almaty'/'Moscow'.
  expect(places.localizePlace('Almaty', 'ZH') === '阿拉木图', "localizePlace('Almaty','ZH') → 阿拉木图");
  expect(places.localizePlace('Moscow', 'ZH') === '莫斯科', "localizePlace('Moscow','ZH') → 莫斯科");
  expect(
    places.localizePlace('Almaty → Moscow', 'ZH') === '阿拉木图 → 莫斯科',
    "маршрут 'Almaty → Moscow' → '阿拉木图 → 莫斯科'"
  );
  expect(
    places.localizePlace('Almaty→Moscow', 'ZH') === '阿拉木图→莫斯科',
    'стрелка без пробелов тоже работает'
  );
}

console.log('\n=== 2. Русские канонические названия (регресс не допущен) ===');
{
  expect(places.localizePlace('Алматы', 'ZH') === '阿拉木图', 'Алматы → 阿拉木图');
  expect(places.localizePlace('Москва', 'ZH') === '莫斯科', 'Москва → 莫斯科');
  expect(
    places.localizePlace('Алматы → Москва', 'ZH') === '阿拉木图 → 莫斯科',
    'русский маршрут → китайский'
  );
}

console.log('\n=== 3. Явно затребованные §3 города ===');
{
  const cases = [
    ['Horgos', '霍尔果斯'],
    ['Khorgos', '霍尔果斯'],
    ['Хоргос', '霍尔果斯'],
    ['Astana', '阿斯塔纳'],
    ['Астана', '阿斯塔纳'],
    ['Yiwu', '义乌'],
    ['Иу', '义乌'],
  ];
  for (const [input, want] of cases) {
    expect(places.localizePlace(input, 'ZH') === want, `${input} → ${want}`);
  }
}

console.log('\n=== 4. Английская локаль получает en-форму, русская — исходник ===');
{
  expect(places.localizePlace('Алматы', 'EN') === 'Almaty', "EN: Алматы → Almaty");
  expect(places.localizePlace('Almaty', 'EN') === 'Almaty', 'EN: латиница остаётся латиницей');
  expect(places.localizePlace('Алматы', 'RU') === 'Алматы', 'RU: без изменений');
  expect(places.localizePlace('Almaty', 'RU') === 'Almaty', 'RU: латиница не переписывается');
}

console.log('\n=== 5. Уже локализованное значение не ломается (идемпотентность) ===');
{
  expect(places.localizePlace('阿拉木图', 'ZH') === '阿拉木图', 'ZH-значение остаётся собой');
  expect(
    places.localizePlace('阿拉木图 → 莫斯科', 'ZH') === '阿拉木图 → 莫斯科',
    'уже китайский маршрут не портится'
  );
}

console.log('\n=== 6. Unknown / user-entered текст НЕ переводится ===');
{
  const untouched = [
    'Мой склад у трассы',
    'Almatynsky rayon',
    'Склад №7',
    'Warehouse near ring road',
  ];
  for (const value of untouched) {
    expect(places.localizePlace(value, 'ZH') === value, `«${value}» остаётся как есть`);
  }
}

console.log('\n=== 7. Резолвер один, экраны его используют (без per-screen патчей) ===');
{
  expect(/export function canonicalPlaceKey/.test(placesSrc), 'экспортирован canonicalPlaceKey');
  expect(/const PLACE_KEY_BY_ALIAS = \(\(\) => \{/.test(placesSrc), 'индекс алиасов построен из словаря');
  expect(
    places.canonicalPlaceKey('Almaty') === 'Алматы',
    'canonicalPlaceKey сводит латиницу к ключу словаря'
  );
  expect(places.canonicalPlaceKey('неизвестно') === null, 'незнакомое → null (не угадываем)');

  // Все живые экраны с маршрутом обязаны идти через канонический резолвер.
  const routeScreens = [
    'src/screens/DealWorkspaceScreenV2.js',
    'src/screens/CargoDetail.js',
    'src/screens/TripDetail.js',
    'src/screens/CargoFeedScreen.js',
    'src/screens/DealsScreen.js',
    'src/screens/FeedScreen.js',
    'src/screens/MyTripsScreen.js',
    'src/screens/PushFilterScreen.js',
    'src/components/ui/v1/FeedCard.js',
    'src/components/RouteMap.js',
    'src/components/deal/DealStatusTimeline.js',
  ];
  for (const screen of routeScreens) {
    expect(/localizePlace/.test(read(screen)), `${path.basename(screen)} использует localizePlace`);
  }
}

console.log('\n=== 8. Текст уведомлений тоже локализуется (не регрессировал) ===');
{
  expect(
    places.localizeSystemMessage('💰 Ставка 1000 USD', 'zh').startsWith('💰 报价'),
    'заголовок «Ставка» → 报价'
  );
  expect(
    places.localizeSystemMessage('1000 USD · Almaty→Moscow', 'zh') === '1000 USD · 阿拉木图→莫斯科',
    'тело уведомления с латинскими городами → китайские'
  );
  expect(
    places.localizeSystemMessage('Привет, как дела?', 'zh') === 'Привет, как дела?',
    'сообщение участника не переводится'
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
