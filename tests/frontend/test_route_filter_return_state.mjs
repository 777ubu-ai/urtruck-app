// §20 RETURN STATE — filter → scroll → open card → back (Task 3, GAP 2).
//
// Два уровня проверки:
//   1. ПОВЕДЕНЧЕСКИЙ — прогоняем сам session-store через сценарий возврата
//      (это настоящая логика восстановления, а не разметка);
//   2. КОНТРАКТНЫЙ — оба экрана ленты действительно подключены к store,
//      focus не перезапрашивает ленту при возврате, скролл возвращается.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const store = await import('../../src/utils/feedSessionState.js');

const LOADS = store.FEED_KEYS.LOADS;
const TRUCKS = store.FEED_KEYS.TRUCKS;

const scope = (originLoc, destLoc, filters) => ({
  origin: { countryId: 'CN', locationId: originLoc },
  destination: { countryId: 'KZ', locationId: destLoc },
  filters,
});

// ══════════════════ 1. ПОВЕДЕНИЕ: сценарий возврата ══════════════════

test('§20 LOADS: filter → scroll → open card → back восстанавливает всё', () => {
  store.clearFeedSnapshot();
  const filters = { filterType: 'tent', dateFrom: '2026-09-10', dateTo: '', sortBy: 'newest', savedOnly: false };
  const current = scope('cn-yiwu', 'kz-almaty', filters);

  // (1) выставили маршрут + вторичные фильтры
  store.writeFeedSnapshot(LOADS, current);
  // (2) загрузились две страницы
  const pages = Array.from({ length: 100 }, (_, i) => ({ id: `cargo-${i}` }));
  store.writeFeedSnapshot(LOADS, { items: pages, pageLimit: 100 });
  // (3) пролистали вниз
  store.writeFeedSnapshot(LOADS, { scrollOffset: 1840 });

  // (4) открыли карточку → (5) Back: экран монтируется и читает снимок
  const restored = store.readFeedSnapshot(LOADS);
  assert.deepEqual(restored.origin, current.origin, 'origin потерян');
  assert.deepEqual(restored.destination, current.destination, 'destination потерян');
  assert.deepEqual(restored.filters, filters, 'вторичные фильтры потеряны');
  assert.equal(restored.items.length, 100, 'загруженные страницы потеряны');
  assert.equal(restored.pageLimit, 100, 'размер страницы потерян');
  assert.equal(restored.scrollOffset, 1840, 'позиция скролла потеряна');

  // И главное: повторный запрос НЕ нужен.
  assert.equal(store.canRestoreFeed(LOADS, current), true,
    'лента будет перезапрошена, хотя восстанавливать есть что');
});

test('§20 TRUCKS: тот же сценарий, независимый снимок', () => {
  store.clearFeedSnapshot();
  const loadsFilters = { filterType: 'tent' };
  const trucksFilters = { filterType: 'ref', sortBy: 'price-asc' };

  store.writeFeedSnapshot(LOADS, {
    ...scope('cn-yiwu', 'kz-almaty', loadsFilters),
    items: [{ id: 'c1' }], scrollOffset: 300,
  });
  store.writeFeedSnapshot(TRUCKS, {
    ...scope('cn-guangzhou', 'kz-astana', trucksFilters),
    items: [{ id: 't1' }, { id: 't2' }], scrollOffset: 920,
  });

  const trucks = store.readFeedSnapshot(TRUCKS);
  assert.equal(trucks.origin.locationId, 'cn-guangzhou');
  assert.equal(trucks.destination.locationId, 'kz-astana');
  assert.deepEqual(trucks.filters, trucksFilters);
  assert.equal(trucks.items.length, 2);
  assert.equal(trucks.scrollOffset, 920);

  // Ленты не перетирают друг друга.
  const loads = store.readFeedSnapshot(LOADS);
  assert.equal(loads.scrollOffset, 300);
  assert.equal(loads.items.length, 1);
  assert.equal(store.canRestoreFeed(TRUCKS, scope('cn-guangzhou', 'kz-astana', trucksFilters)), true);
  assert.equal(store.canRestoreFeed(LOADS, scope('cn-guangzhou', 'kz-astana', trucksFilters)), false);
});

test('§20 смена фильтра ОБЯЗАНА перезапросить, а не показать старую ленту', () => {
  store.clearFeedSnapshot();
  const filters = { filterType: 'tent' };
  const before = scope('cn-yiwu', 'kz-almaty', filters);
  store.writeFeedSnapshot(LOADS, { ...before, items: [{ id: 'x' }] });

  assert.equal(store.canRestoreFeed(LOADS, before), true);
  // Другая точка назначения.
  assert.equal(store.canRestoreFeed(LOADS, scope('cn-yiwu', 'kz-astana', filters)), false);
  // Другой кузов.
  assert.equal(store.canRestoreFeed(LOADS, scope('cn-yiwu', 'kz-almaty', { filterType: 'ref' })), false);
  // Сброшенный маршрут.
  assert.equal(store.canRestoreFeed(LOADS, { origin: null, destination: null, filters }), false);
  // «Вся страна» и «страна + город» — РАЗНЫЕ scope.
  store.clearFeedSnapshot();
  const whole = { origin: { countryId: 'CN', locationId: null }, destination: null, filters };
  store.writeFeedSnapshot(LOADS, { ...whole, items: [{ id: 'y' }] });
  assert.equal(store.canRestoreFeed(LOADS, whole), true);
  assert.equal(store.canRestoreFeed(LOADS, {
    origin: { countryId: 'CN', locationId: 'cn-yiwu' }, destination: null, filters,
  }), false, '«весь Китай» и «Иу» считаются одним фильтром');
});

test('§20 пустая лента не считается восстановимой', () => {
  store.clearFeedSnapshot();
  const cur = scope('cn-yiwu', 'kz-almaty', {});
  store.writeFeedSnapshot(LOADS, { ...cur, items: [] });
  assert.equal(store.canRestoreFeed(LOADS, cur), false,
    'пустой результат заморозил бы ленту пустой');
  store.writeFeedSnapshot(LOADS, { items: null });
  assert.equal(store.canRestoreFeed(LOADS, cur), false);
});

test('§20 частичный patch не сбрасывает остальные поля', () => {
  store.clearFeedSnapshot();
  const cur = scope('cn-yiwu', 'kz-almaty', { filterType: 'tent' });
  store.writeFeedSnapshot(LOADS, { ...cur, items: [{ id: 'a' }], scrollOffset: 500 });
  store.writeFeedSnapshot(LOADS, { scrollOffset: 640 });
  const snap = store.readFeedSnapshot(LOADS);
  assert.equal(snap.scrollOffset, 640);
  assert.equal(snap.items.length, 1, 'patch потерял загруженные страницы');
  assert.deepEqual(snap.origin, cur.origin);
});

test('§20 это session-состояние, а НЕ persistence «навсегда»', () => {
  const src = read('src/utils/feedSessionState.js');
  assert.doesNotMatch(src, /from '\.\/storage'/, 'снимок пишется в storage');
  assert.doesNotMatch(src, /AsyncStorage/, 'снимок пишется в AsyncStorage');
  assert.match(src, /const SNAPSHOTS = new Map\(\);/, 'снимок не в памяти модуля');
  assert.match(src, /clearFeedSnapshot/, 'нет явного сброса на logout');
});

// ══════════════════ 2. КОНТРАКТ: экраны подключены ══════════════════

const SCREENS = [
  ['src/screens/CargoFeedScreen.js', 'FEED_KEYS.LOADS'],
  ['src/screens/FeedScreen.js', 'FEED_KEYS.TRUCKS'],
];

test('§20 оба экрана инициализируют состояние из снимка', () => {
  for (const [file, key] of SCREENS) {
    const src = read(file);
    assert.match(src, /from '\.\.\/utils\/feedSessionState'/, `${file}: store не подключён`);
    assert.match(src, new RegExp(`readFeedSnapshot\\(${key.replace('.', '\\.')}\\)`), `${file}: снимок не читается`);
    // Маршрут, вторичные фильтры, страницы и размер страницы.
    assert.match(src, /useState\(snapshot\.origin \|\| null\)/, `${file}: origin не восстановлен`);
    assert.match(src, /useState\(snapshot\.destination \|\| null\)/, `${file}: destination не восстановлен`);
    assert.match(src, /useState\(snapshot\.items \|\| \[\]\)/, `${file}: страницы не восстановлены`);
    assert.match(src, /useState\(snapshot\.pageLimit \|\| 50\)/, `${file}: размер страницы не восстановлен`);
    for (const f of ['filterType', 'dateFrom', 'dateTo', 'sortBy', 'savedOnly']) {
      assert.match(src, new RegExp(`snapshot\\.filters\\?\\.${f}`), `${file}: фильтр ${f} не восстановлен`);
    }
    // Спиннер не должен перекрывать восстановленную ленту.
    assert.match(src, /useState\(!snapshot\.items\)/, `${file}: loading игнорирует снимок`);
  }
});

test('§20 объявление snapshot идёт до первого использования (TDZ)', () => {
  for (const [file] of SCREENS) {
    const src = read(file);
    const decl = src.indexOf('const snapshot = React.useRef(readFeedSnapshot');
    const use = src.indexOf('useState(snapshot.items');
    assert.ok(decl > 0, `${file}: snapshot не объявлен`);
    assert.ok(decl < use, `${file}: snapshot используется до объявления — TDZ`);
  }
});

test('§20 возврат с карточки НЕ перезапрашивает ленту', () => {
  for (const [file, key] of SCREENS) {
    const src = read(file);
    const k = key.replace('.', '\\.');
    assert.match(src, new RegExp(`if \\(!canRestoreFeed\\(${k}, scopeForSnapshot\\)\\) \\{\\s*\\n\\s*load\\(\\);`),
      `${file}: focus безусловно вызывает load() — страницы и скролл теряются`);
    // Избранное обновляется всегда: оно могло измениться в карточке.
    assert.match(src, /loadSaved\(\);\s*\n\s*\}, \[load, loadSaved, scopeForSnapshot\]\)\);/,
      `${file}: избранное не обновляется на возврате`);
  }
});

test('§20 позиция скролла пишется и возвращается', () => {
  for (const [file, key] of SCREENS) {
    const src = read(file);
    const k = key.replace('.', '\\.');
    assert.match(src, /ref=\{listRef\}/, `${file}: список без ref`);
    assert.match(src, /onScroll=\{onFeedScroll\}/, `${file}: скролл не отслеживается`);
    assert.match(src, /scrollEventThrottle=\{16\}/, `${file}`);
    assert.match(src, new RegExp(`writeFeedSnapshot\\(${k}, \\{ scrollOffset: y \\}\\)`),
      `${file}: offset не сохраняется`);
    assert.match(src, /listRef\.current\?\.scrollToOffset\?\.\(\{ offset: target, animated: false \}\)/,
      `${file}: позиция не восстанавливается`);
    // requestAnimationFrame, а не таймер на удачу.
    assert.match(src, /requestAnimationFrame\(/, `${file}`);
    assert.match(src, /cancelAnimationFrame\(raf\)/, `${file}: rAF не отменяется при размонтировании`);
    // Восстанавливаем один раз за визит.
    assert.match(src, /restoredRef\.current = true;/, `${file}`);
    assert.match(src, /\(\) => \{ restoredRef\.current = false; \}/, `${file}: флаг не сбрасывается на уходе`);
  }
});

test('§20 фильтры и страницы пишутся в снимок при изменении', () => {
  for (const [file, key] of SCREENS) {
    const src = read(file);
    const k = key.replace('.', '\\.');
    assert.match(src, new RegExp(`writeFeedSnapshot\\(${k}, scopeForSnapshot\\)`),
      `${file}: фильтр не пишется в снимок`);
    assert.match(src, new RegExp(`writeFeedSnapshot\\(${k}, \\{ items, pageLimit \\}\\)`),
      `${file}: страницы не пишутся в снимок`);
    // Незавершённую загрузку в снимок не пишем — иначе Back вернёт пустоту.
    assert.match(src, /if \(loading\) return;/, `${file}: пишет снимок во время загрузки`);
  }
});

test('§20 навигация не менялась — Chat/Voice path не затронут', () => {
  // Graphify по scope: оба экрана импортирует ТОЛЬКО AppNavigator, и ни один
  // из них не связан с chat/voice/deal. Return state сделан внутри экранов,
  // поэтому навигационный файл править не потребовалось.
  const nav = read('src/navigation/AppNavigator.js');
  assert.doesNotMatch(nav, /feedSessionState/, 'навигация втянута в return state');
  for (const [file] of SCREENS) {
    const src = read(file);
    for (const risky of ['DealWorkspace', 'ChatScreen', 'voiceRecorder', 'VoiceMessage', 'chatAPI']) {
      assert.doesNotMatch(src, new RegExp(`from '[^']*${risky}`), `${file} тянет ${risky}`);
    }
  }
});
