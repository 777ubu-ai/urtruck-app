// Main Route Filter V2 — контракты фронтенда (Task 3).
//
// Запуск: node --experimental-loader ./tests/frontend/loader.mjs \
//              tests/frontend/test_main_route_filter_v2.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

const geo = await import('../../src/utils/geoCatalog.js');
const strings = await import('../../src/utils/routeFilterStrings.js');

// ══════════════════ §5 модель данных ══════════════════

test('§5 каталог нормализован: id, country_id, location_type, локализация', () => {
  assert.ok(geo.COUNTRIES.length >= 30, `стран ${geo.COUNTRIES.length}`);
  assert.ok(geo.LOCATIONS.length >= 150, `локаций ${geo.LOCATIONS.length}`);
  const ids = geo.LOCATIONS.map((l) => l.id);
  assert.equal(ids.length, new Set(ids).size, 'location_id не уникальны');
  const allowed = new Set(Object.values(geo.LOCATION_TYPES));
  for (const l of geo.LOCATIONS) {
    assert.ok(l.id && l.country_id, JSON.stringify(l));
    assert.ok(allowed.has(l.type), `неизвестный location_type: ${l.type}`);
    assert.ok(l.names?.ru, `нет RU-названия у ${l.id}`);
    assert.ok(geo.getCountry(l.country_id), `локация ${l.id} ссылается на несуществующую страну`);
    assert.ok(Array.isArray(l.aliases), `aliases не массив у ${l.id}`);
  }
});

test('§5 второго параллельного справочника не создано', () => {
  const src = read('src/utils/geoCatalog.js');
  // Каталог берётся ИЗ одного генерируемого источника.
  assert.match(src, /from '\.\/geoCatalogData'/);
  const gen = read('scripts/generate_geo_catalog.py');
  assert.match(gen, /shared\/geo-catalog\.json/, 'генератор не пишет JSON для backend');
  assert.match(gen, /src\/utils\/geoCatalogData\.js/, 'генератор не пишет JS для frontend');
  const py = read('backend/services/geo_catalog.py');
  assert.match(py, /geo-catalog\.json/, 'backend читает не тот же каталог');
});

test('§1 integration dependency: places.js и i18n.js не тронуты', () => {
  const picker = read('src/components/RoutePointPickerV2.js');
  for (const [name, src] of [['picker', picker]]) {
    assert.doesNotMatch(src, /from '\.\.\/utils\/i18n'/, `${name} импортирует i18n.js`);
    assert.doesNotMatch(src, /from '\.\.\/utils\/places'/, `${name} импортирует places.js`);
  }
  assert.match(read('src/utils/routeFilterStrings.js'), /INTEGRATION DEPENDENCY/);
});

// ══════════════════ §4 WHOLE COUNTRY ══════════════════

test('§4 «вся страна» — это scope, а не fake city', () => {
  const p = geo.makeRoutePoint('CN');
  assert.deepEqual(p, { countryId: 'CN', locationId: null });
  assert.equal(geo.isWholeCountry(p), true);
  // Никакой сущности-города «весь Китай» в каталоге нет.
  for (const l of geo.LOCATIONS) {
    assert.doesNotMatch(l.names.ru, /^Вес[ья]\s/i, `fake city в каталоге: ${l.id}`);
    assert.doesNotMatch(l.names.ru, /^Все\s/i, `fake city в каталоге: ${l.id}`);
  }
  const city = geo.makeRoutePoint('CN', 'cn-yiwu');
  assert.deepEqual(city, { countryId: 'CN', locationId: 'cn-yiwu' });
  assert.equal(geo.isWholeCountry(city), false);
});

test('§4 подпись «вся страна» согласована по роду и числу в RU', () => {
  assert.equal(geo.routePointLabel(geo.makeRoutePoint('CN'), 'ru'), 'Весь Китай');
  assert.equal(geo.routePointLabel(geo.makeRoutePoint('KZ'), 'ru'), 'Весь Казахстан');
  assert.equal(geo.routePointLabel(geo.makeRoutePoint('DE'), 'ru'), 'Вся Германия');
  assert.equal(geo.routePointLabel(geo.makeRoutePoint('NL'), 'ru'), 'Все Нидерланды');
});

// ══════════════════ §7 Европа ══════════════════

test('§7 все обязательные страны Европы в каталоге и с локациями', () => {
  const required = {
    DE: 'Германия', NL: 'Нидерланды', BE: 'Бельгия', PL: 'Польша',
    FR: 'Франция', IT: 'Италия', CZ: 'Чехия', AT: 'Австрия',
    HU: 'Венгрия', SK: 'Словакия', SI: 'Словения', LT: 'Литва',
    LV: 'Латвия', EE: 'Эстония', FI: 'Финляндия', DK: 'Дания',
    SE: 'Швеция', ES: 'Испания',
  };
  for (const [code, ru] of Object.entries(required)) {
    const c = geo.getCountry(code);
    assert.ok(c, `нет страны ${code}`);
    assert.equal(c.names.ru, ru);
    assert.ok(geo.locationsForCountry(code).length > 0, `у ${code} нет ни одной локации`);
  }
});

test('§7 страны не захардкожены отдельными UI-condition', () => {
  for (const f of ['src/components/RoutePointPickerV2.js', 'src/screens/FeedScreen.js', 'src/screens/CargoFeedScreen.js']) {
    const src = read(f);
    // Ни один ISO-код страны не должен появляться как ветка логики.
    for (const code of ['DE', 'NL', 'BE', 'FR', 'IT', 'ES', 'CZ', 'AT', 'FI', 'SE']) {
      assert.doesNotMatch(src, new RegExp(`===\\s*'${code}'`), `${f}: ветка под ${code}`);
    }
  }
});

// ══════════════════ §8 локализация ══════════════════

test('§8 один location_id → разные display names, языки не смешиваются', () => {
  assert.equal(geo.locationName('kz-almaty', 'ru'), 'Алматы');
  assert.equal(geo.locationName('kz-almaty', 'zh'), '阿拉木图');
  assert.equal(geo.locationName('kz-almaty', 'en'), 'Almaty');
  assert.equal(geo.locationName('kz-almaty', 'kk'), 'Алматы');
  assert.equal(geo.countryName('CN', 'zh'), '中国');
  assert.equal(geo.countryName('CN', 'kk'), 'Қытай');
  // ZH-подпись не должна протаскивать русский хвост.
  const zh = geo.routePointLabel(geo.makeRoutePoint('KZ', 'kz-almaty'), 'zh');
  assert.doesNotMatch(zh, /[А-Яа-я]/, `ZH-подпись содержит кириллицу: ${zh}`);
  const ru = geo.routePointLabel(geo.makeRoutePoint('KZ', 'kz-almaty'), 'ru');
  assert.doesNotMatch(ru, /[一-鿿]/, `RU-подпись содержит иероглифы: ${ru}`);
});

test('§8 неизвестная локаль честно падает на RU, а не ломает UI', () => {
  assert.equal(geo.locationName('kz-almaty', 'fr'), 'Алматы');
  assert.equal(geo.normalizeLang('zh-CN'), 'zh');
  assert.equal(geo.normalizeLang('ZH'), 'zh');
  assert.equal(geo.normalizeLang(undefined), 'ru');
});

test('§8 строки фильтра симметричны по всем 4 языкам', () => {
  const keys = strings.routeStringKeys();
  assert.ok(keys.length >= 15);
  for (const lang of strings.SUPPORTED_ROUTE_LANGS) {
    const dict = strings.routeStrings(lang);
    for (const k of keys) {
      assert.ok(dict[k], `${lang}.${k} отсутствует`);
    }
  }
  // ZH-строки действительно на китайском, а не копия русского.
  assert.match(strings.routeStrings('zh').route_search_placeholder, /[一-鿿]/);
  assert.notEqual(strings.routeStrings('zh').route_from, strings.routeStrings('ru').route_from);
});

// ══════════════════ §9 КПП отличается от города ══════════════════

test('§9 border crossing и hub помечены, город — нет', () => {
  assert.equal(geo.routePointLabel(geo.makeRoutePoint('KZ', 'kz-nur-zholy'), 'ru'), 'Нур Жолы · КПП');
  assert.match(geo.routePointLabel(geo.makeRoutePoint('PL', 'pl-malaszewicze-terminal'), 'ru'), / · Хаб$/);
  assert.equal(geo.routePointLabel(geo.makeRoutePoint('KZ', 'kz-almaty'), 'ru'), 'Алматы');
  // В ZH — свой суффикс, без кириллицы.
  assert.match(geo.routePointLabel(geo.makeRoutePoint('KZ', 'kz-nur-zholy'), 'zh'), /口岸$/);
});

// ══════════════════ §6 поиск ══════════════════

test('§6 поиск находит страну, город, КПП, хаб, локализации и aliases', () => {
  const first = (q) => geo.searchGeo(q)[0];
  assert.equal(first('Казахстан').kind, 'country');
  assert.equal(first('Алматы').locationId, 'kz-almaty');
  assert.equal(first('阿拉木图').locationId, 'kz-almaty');
  assert.equal(first('Almaty').locationId, 'kz-almaty');
  assert.equal(first('Nur-Sultan').locationId, 'kz-astana', 'alias не найден');
  assert.equal(first('Yiwu').locationId, 'cn-yiwu');
  assert.equal(first('Rotterdam').locationId, 'nl-rotterdam');
  assert.equal(first('Malaszewicze').countryId, 'PL');
  // КПП находится по своему имени.
  const horgos = geo.searchGeo('Нур Жолы');
  assert.ok(horgos.some((h) => h.locationId === 'kz-nur-zholy'));
  assert.deepEqual(geo.searchGeo('zzzznotacity'), []);
});

test('§6 поиск с debounce, а не на каждое нажатие', () => {
  const src = read('src/components/RoutePointPickerV2.js');
  assert.match(src, /SEARCH_DEBOUNCE_MS\s*=\s*\d+/);
  assert.match(src, /setTimeout\(\(\)\s*=>\s*setQuery\(rawQuery\)/);
  assert.match(src, /clearTimeout/);
});

// ══════════════════ §10 навигация ══════════════════

test('§10 back: город → страна → все страны, без сброса выбранного', () => {
  const src = read('src/components/RoutePointPickerV2.js');
  const back = src.slice(src.indexOf('const goBack'), src.indexOf('const headerTitle'));
  assert.match(back, /if \(query\.trim\(\)\)/, 'back не снимает сначала поиск');
  assert.match(back, /if \(stageCountry\) \{ setStageCountry\(null\); return; \}/,
    'back со стадии страны не возвращает к списку стран');
  assert.match(back, /onClose/, 'со стадии «все страны» back не закрывает пикер');
  // Открытие пикера возвращает на стадию УЖЕ выбранной страны.
  assert.match(src, /setStageCountry\(value\?\.countryId \|\| null\)/);
});

test('§10 сердечки избранного сохранены и живут на location_id', () => {
  const src = read('src/components/RoutePointPickerV2.js');
  assert.match(src, /name="heart"/, 'сердечки убраны');
  assert.match(src, /toggleFav/);
  assert.match(src, /FAV_KEY\s*=\s*'ur_fav_locations_v2'/);
  assert.match(src, /toggleFav\(loc\.id\)/, 'избранное хранится не по location_id');
});

// ══════════════════ §11/§12 компактность ══════════════════

test('§11 маршрутный селектор ниже, но touch target не ужат', () => {
  for (const f of ['src/screens/FeedScreen.js', 'src/screens/CargoFeedScreen.js']) {
    const s = read(f);
    // 68 → 52: минус 16dp вертикали на обеих лентах.
    assert.match(s, /routeSelector:\s*\{[^}]*minHeight:\s*52/, `${f}: селектор не сжат`);
    assert.match(s, /routeSelector:\s*\{[^}]*paddingVertical:\s*6/, `${f}: padding не сжат`);
    // Нажимаемая половина осталась >= 44dp.
    assert.match(s, /routeHalf:\s*\{[^}]*minHeight:\s*44/, `${f}: touch target ужат`);
    // Состав сохранён: Откуда → стрелка → Куда, оба значения, сброс.
    assert.match(s, /name="arrow-right"/, `${f}: пропала стрелка`);
    assert.match(s, /feed-route-from/, `${f}: пропало «Откуда»`);
    assert.match(s, /feed-route-to/, `${f}: пропало «Куда»`);
    assert.match(s, /-route-from-value/, `${f}: нет значения «Откуда»`);
    assert.match(s, /-route-to-value/, `${f}: нет значения «Куда»`);
    assert.match(s, /feed-route-clear/, `${f}: нет сброса маршрута`);
  }
});

test('§12 чипы в одну строку с горизонтальным скроллом, без переноса', () => {
  for (const f of ['src/screens/FeedScreen.js', 'src/screens/CargoFeedScreen.js']) {
    const s = read(f);
    assert.match(s, /<ScrollView\s*\n\s*horizontal/, `${f}: чипы не скроллятся горизонтально`);
    assert.match(s, /showsHorizontalScrollIndicator=\{false\}/, f);
    assert.doesNotMatch(s, /filters:\s*\{[^}]*flexWrap/, `${f}: чипы переносятся на строки`);
  }
  // Мёртвая высота вокруг чипов убрана, сам pill остался 40dp.
  const cargo = read('src/screens/CargoFeedScreen.js');
  assert.match(cargo, /filtersScroll:\s*\{ flexGrow:\s*0,\s*minHeight:\s*44,\s*maxHeight:\s*44 \}/);
  assert.match(cargo, /filterPill:\s*\{[^}]*height:\s*40/, 'touch target чипа ужат');
});

test('§15 клиентская фильтрация по стране удалена из ленты', () => {
  const feed = read('src/screens/FeedScreen.js');
  // Раньше лента приходила целиком, а телефон отсеивал чужие страны.
  assert.doesNotMatch(feed, /dirFromCountry/, 'локальный фильтр по стране остался');
  assert.doesNotMatch(feed, /dirToCountry/, 'локальный фильтр по стране остался');
  for (const f of ['src/screens/FeedScreen.js', 'src/screens/CargoFeedScreen.js']) {
    const s = read(f);
    assert.match(s, /origin: routeOrigin/, `${f}: маршрут не уходит на сервер`);
    assert.match(s, /destination: routeDestination/, f);
    assert.match(s, /signal: controller\?\.signal/, `${f}: запрос нельзя отменить`);
    assert.match(s, /result\?\.aborted/, `${f}: отмена трактуется как ошибка`);
    assert.doesNotMatch(s, /fromCity: dirFrom/, `${f}: остался LIKE-фильтр по тексту`);
    assert.match(s, /RoutePointPickerV2/, `${f}: новый пикер не подключён`);
    assert.doesNotMatch(s, /LocationPickerModal/, `${f}: старый пикер всё ещё смонтирован`);
  }
});

test('§13/§14 карточки компактнее, закладка поднята, цена не конфликтует', () => {
  const feed = read('src/screens/FeedScreen.js');
  const cargo = read('src/screens/CargoFeedScreen.js');

  // Рейсы: 104 → 88, закладка вверх.
  assert.match(feed, /minHeight:\s*88/);
  assert.match(feed, /bookmarkBtn:\s*\{[\s\S]{0,400}?top:\s*6/);
  assert.doesNotMatch(feed, /bookmarkBtn:\s*\{[\s\S]{0,400}?bottom:\s*6/,
    'закладка рейса всё ещё внизу');
  // Цена внизу справа, закладка вверху справа — не одна зона.
  assert.match(feed, /priceWrap:\s*\{[^}]*bottom:\s*8/);
  // Touch target закладки не ужат.
  assert.match(feed, /bookmarkBtn:\s*\{[\s\S]{0,400}?width:\s*40,\s*\n?\s*height:\s*40/);

  // Грузы: 120 → 100, закладка вверх.
  assert.match(cargo, /minHeight:\s*100/);
  assert.match(cargo, /bookmarkBtn:\s*\{[^}]*top:\s*6/);
  assert.doesNotMatch(cargo, /bookmarkBtn:\s*\{[^}]*bottom:\s*6/,
    'закладка груза всё ещё внизу');
  assert.match(cargo, /bookmarkBtn:\s*\{[^}]*width:\s*40, height:\s*40/);
  // Длинные названия маршрута: строка маршрута резервирует зону закладки.
  assert.match(cargo, /cardTopRow:\s*\{[^}]*paddingRight:\s*44/);
  assert.match(feed, /route:\s*\{[^}]*paddingRight:\s*48/);
});

// ══════════════════ §15/§17 сервер-сайд и пагинация ══════════════════

test('§15 маршрут уходит на сервер, а не фильтруется на телефоне', () => {
  const api = read('src/utils/marketAPI.js');
  assert.match(api, /const appendRouteScope/);
  assert.match(api, /params\.set\('origin_country_id'/);
  assert.match(api, /params\.set\('origin_location_id'/);
  assert.match(api, /params\.set\('destination_country_id'/);
  assert.match(api, /params\.set\('destination_location_id'/);
  // Оба списка принимают маршрут.
  for (const fn of ['listCargos', 'listTrips']) {
    const body = api.slice(api.indexOf(`async ${fn}(`), api.indexOf(`async ${fn}(`) + 1200);
    assert.match(body, /origin = null, destination = null/, `${fn} без маршрута`);
    assert.match(body, /appendRouteScope\(params, origin, destination\)/, `${fn} не шлёт scope`);
    assert.match(body, /signal/, `${fn} не поддерживает отмену запроса`);
  }
});

test('§4 пустая локация НЕ отправляется — сервер обязан отличать whole country', () => {
  const params = geo.routeFilterParams(
    { countryId: 'CN', locationId: null },
    { countryId: 'KZ', locationId: 'kz-almaty' },
  );
  assert.deepEqual(params, {
    origin_country_id: 'CN',
    destination_country_id: 'KZ',
    destination_location_id: 'kz-almaty',
  });
  assert.ok(!('origin_location_id' in params), 'отправлен пустой origin_location_id');
});

test('§17 устаревший ответ не смешивается с новым', () => {
  const api = read('src/utils/marketAPI.js');
  assert.match(api, /AbortError/, 'отменённый запрос не распознаётся');
  assert.match(api, /aborted: true/, 'отмена помечается как ошибка сервера');
});

// ══════════════════ §21 валидация ══════════════════

test('§21 локация обязана принадлежать стране', () => {
  assert.equal(geo.isLocationInCountry('KZ', 'kz-almaty'), true);
  assert.equal(geo.isLocationInCountry('DE', 'kz-almaty'), false);
  assert.equal(geo.isLocationInCountry('CN', 'nope'), false);
  assert.equal(geo.isLocationInCountry('CN', null), true, 'whole country должен быть валиден');
  assert.equal(geo.makeRoutePoint('DE', 'kz-almaty'), null);
  assert.equal(geo.makeRoutePoint('XX'), null);
});

// ══════════════════ §18/§19 производительность и пустое состояние ═══════

test('§18 длинные списки не рендерятся целиком', () => {
  const src = read('src/components/RoutePointPickerV2.js');
  assert.match(src, /<SectionList/);
  assert.match(src, /initialNumToRender=\{\d+\}/);
  assert.match(src, /maxToRenderPerBatch=\{\d+\}/);
  assert.match(src, /windowSize=\{\d+\}/);
  assert.match(src, /removeClippedSubviews/);
});

test('§18 поиск использует предпостроенный индекс, а не перебор каталога', () => {
  const src = read('src/utils/geoCatalog.js');
  assert.match(src, /const SEARCH_INDEX = \(\(\) => \{/, 'индекс поиска не построен заранее');
  assert.match(src, /const LOCATIONS_BY_COUNTRY = \(\(\) => \{/);
  // 200 поисков не должны занимать заметное время.
  const t0 = Date.now();
  for (let i = 0; i < 200; i += 1) geo.searchGeo('ал');
  assert.ok(Date.now() - t0 < 500, `200 поисков заняли ${Date.now() - t0}ms`);
});

test('§19 пустое состояние и сброс присутствуют во всех языках', () => {
  for (const lang of strings.SUPPORTED_ROUTE_LANGS) {
    const d = strings.routeStrings(lang);
    assert.ok(d.route_empty_title);
    assert.ok(d.route_empty_change);
    assert.ok(d.route_empty_reset);
    assert.ok(d.route_reset_origin);
    assert.ok(d.route_reset_destination);
    assert.ok(d.route_reset_all);
    assert.ok(d.route_error_title);
    assert.ok(d.route_error_retry);
  }
  const picker = read('src/components/RoutePointPickerV2.js');
  // Очистить одну точку можно из самого пикера.
  assert.match(picker, /onSelect\?\.\(null\)/, 'нельзя очистить точку');
  for (const f of ['src/screens/FeedScreen.js', 'src/screens/CargoFeedScreen.js']) {
    assert.match(read(f), /feed-route-clear/, `${f}: нет сброса маршрута`);
  }
});

// ══════════════════ §24 чужие зоны не тронуты ══════════════════

test('§24 chat / voice / deal / GPS / map / auth не затронуты', () => {
  const forbidden = [
    'src/screens/DealWorkspaceScreenV2.js',
    'src/utils/voiceRecorder.js',
    'src/components/VoiceMessageBubble.js',
    'src/utils/i18n.js',
    'src/utils/places.js',
    'src/navigation/AppNavigator.js',
  ];
  // Тест сам себя не проверит на diff — это делает git в отчёте. Здесь
  // фиксируем, что новые модули на них не ссылаются и не реэкспортируют их.
  const mine = [
    'src/utils/geoCatalog.js',
    'src/utils/routeFilterStrings.js',
    'src/components/RoutePointPickerV2.js',
  ];
  for (const f of mine) {
    const src = read(f);
    for (const dep of forbidden) {
      const base = dep.split('/').pop().replace('.js', '');
      assert.doesNotMatch(src, new RegExp(`from '[^']*${base}'`), `${f} импортирует ${dep}`);
    }
  }
});

// ══════════════════ конвенции UI проекта ══════════════════

test('UI-конвенции: RN-only, StyleSheet, SafeAreaView', () => {
  for (const f of ['src/components/RoutePointPickerV2.js']) {
    const src = read(f);
    assert.doesNotMatch(src, /\b(document|window|localStorage)\./, `${f}: web-only API`);
    assert.match(src, /StyleSheet\.create\(/, `${f}: нет StyleSheet.create`);
    assert.doesNotMatch(src, /style=\{\{/, `${f}: inline-стиль в JSX`);
  }
  assert.match(read('src/components/RoutePointPickerV2.js'), /SafeAreaView/);
});
