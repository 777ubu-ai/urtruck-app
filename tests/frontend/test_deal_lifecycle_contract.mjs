import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Регресс-контракт по аудиту 2026-08-21. Все найденные баги — это РАСХОЖДЕНИЕ
// списков статусов между backend-FSM и потребителями (чат, бейдж, guard'ы).
// Тесты проверяют не «строка есть в файле», а что производные списки
// покрывают канонический FSM, — чтобы добавление нового статуса в _DEAL_FLOW
// сразу роняло тест, а не тихо отключало чат/бейдж, как это уже случилось.

const read = (p) => fs.readFileSync(p, 'utf8');
const chatPy = read('backend/api/chat.py');
const marketPy = read('backend/api/marketplace.py');
const dealsUnread = read('src/utils/dealsUnread.js');
const places = read('src/utils/places.js');
const cargoV2 = read('src/screens/CargoDetailV2.js');
const tripV2 = read('src/screens/TripDetailV2.js');
const chatV2 = read('src/screens/ChatScreenV2.js');
const workspace = read('src/screens/DealWorkspaceScreenV2.js');
const routeMap = read('src/components/RouteMap.js');

/** Активные (не терминальные) статусы из канонического серверного _DEAL_FLOW. */
function activeFlowStatuses() {
  const block = marketPy.match(/_DEAL_FLOW = \{([\s\S]*?)\n\}/)[1];
  const keys = [...block.matchAll(/"([a-z_]+)":\s*\{?/g)].map((m) => m[1]);
  return keys.filter((k) => !['cancelled', 'rejected', 'expired'].includes(k));
}

function pyTuple(source, name) {
  const block = source.match(new RegExp(`${name} = \\(([^)]*)\\)`))[1];
  return block.split(',').map((v) => v.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
}

function jsSet(source, name) {
  const block = source.match(new RegExp(`${name} = new Set\\(\\[([\\s\\S]*?)\\]\\)`))[1];
  return block.split(',').map((v) => v.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
}

test('P0: чат доступен на КАЖДОМ активном статусе FSM, включая received', () => {
  const flow = activeFlowStatuses();
  const chat = pyTuple(chatPy, '_DEAL_CHAT_STATUSES');
  assert.ok(chat.includes('received'),
    'received отсутствует в _DEAL_CHAT_STATUSES — чат умирает между «Подтвердить получение» и «Завершить сделку»');
  const missing = flow.filter((s) => !chat.includes(s));
  assert.deepEqual(missing, [],
    `статусы FSM без доступа к чату: ${missing.join(', ')}`);
});

test('P0: приём ставки без cargo_id и trip_id заблокирован (нет владельца — нет авторизации)', () => {
  const fn = marketPy.split('def _finalize_accept_inline(')[1].split('\ndef ')[0];
  assert.match(fn, /if not bid\.get\("cargo_id"\) and not bid\.get\("trip_id"\)/,
    'нет fail-closed проверки непривязанной ставки');
  assert.match(fn, /raise HTTPException\(\s*status_code=409/);
  // Ставка на удалённый/несуществующий рейс тоже обязана падать, а не
  // проваливаться мимо проверки владельца.
  assert.match(fn, /if not trip:\s*\n\s*raise HTTPException\(status_code=404/,
    'отсутствующий trip должен давать 404, а не пропускать проверку driver_id');
});

test('P1: бейдж «Сделки» считает delivered и received — мяч там у грузоотправителя', () => {
  const active = jsSet(dealsUnread, 'ACTIVE_DEAL_STATUSES');
  for (const s of ['delivered', 'received']) {
    assert.ok(active.includes(s), `${s} отсутствует в ACTIVE_DEAL_STATUSES`);
  }
  for (const s of ['completed', 'cancelled', 'rejected', 'expired']) {
    assert.ok(!active.includes(s), `${s} не должен считаться активным`);
  }
});

test('P1: устаревшая точка GPS гасится по авторитетному has_location:false', () => {
  for (const [name, src] of [['DealWorkspaceScreenV2', workspace], ['RouteMap', routeMap]]) {
    assert.match(src, /else if \(result\?\.ok === true\) setLocation\(null\)/,
      `${name}: нет сброса устаревшей позиции при has_location:false`);
  }
});

test('P1: GPS-сообщения согласия локализованы для ZH/EN/KK', () => {
  const dict = places.match(/const SYSTEM_MESSAGE_DICT = \{([\s\S]*?)\n\};/)[1];
  const gps = [
    'Грузоотправитель запросил GPS-отслеживание',
    'Водитель разрешил GPS-отслеживание',
    'Водитель не разрешил GPS-отслеживание',
    'Водитель отменил GPS-отслеживание',
  ];
  for (const phrase of gps) {
    assert.ok(dict.includes(phrase), `нет перевода системного сообщения: ${phrase}`);
  }
  // Каждая запись словаря обязана иметь все три языка — иначе тихий русский.
  for (const entry of dict.matchAll(/\{\s*zh:[\s\S]*?\}/g)) {
    for (const lang of ['zh:', 'en:', 'kk:']) {
      assert.ok(entry[0].includes(lang), `запись словаря без ${lang}: ${entry[0].slice(0, 60)}`);
    }
  }
});

test('P1: legacy-комната без chat_room_id восстанавливается по cargo_id/trip_id', () => {
  const fn = chatPy.split('def _enrich_rooms_with_deal_context(')[1].split('\n@')[0];
  // Issue #290 переписал per-room fallback на batch: orphan_rooms фильтрует
  // комнаты без deal по cargo_id/trip_id, затем для каждой ищет deal в БД.
  assert.match(fn, /not in deals_by_room[\s\S]*?r\.get\("cargo_id"\) or r\.get\("trip_id"\)/,
    'нет fallback-поиска сделки — комната исчезнет из /chat/rooms');
  assert.match(fn, /UPDATE deals SET chat_room_id = COALESCE/,
    'связь deal.chat_room_id не чинится на месте');
});

test('P1: все три входа в сделку идут через канонический DealWorkspaceRoute', () => {
  // Апстрим (81d1ccc и раньше) закрыл этот дефект лучше, чем ad-hoc обёртка на
  // каждом экране: один route-хост DealWorkspaceRoute владеет гейтом, а
  // qa/utils/gpsConsentSmoke.js прямо ЗАПРЕЩАЕТ экранам импортировать
  // DealWorkspaceScreenV2 или монтировать DealLocationPermissionGate вручную.
  // Тест держит именно этот инвариант, чтобы новый вход в сделку нельзя было
  // добавить в обход disclosure.
  for (const [name, src] of [
    ['ChatScreenV2', chatV2], ['CargoDetailV2', cargoV2], ['TripDetailV2', tripV2],
  ]) {
    assert.match(src, /DealWorkspaceRoute/,
      `${name}: вход в сделку минует канонический gated-route — «Начать рейс» упадёт в disclosure_host_unavailable`);
    assert.ok(!src.includes("from './DealWorkspaceScreenV2'"),
      `${name}: прямой импорт DealWorkspaceScreenV2 обходит гейт`);
    assert.ok(!src.includes('DealLocationPermissionGate'),
      `${name}: ad-hoc permission-host запрещён, гейт живёт в DealWorkspaceRoute`);
  }
});

test('P1 (#280): роль в DealWorkspace определяется из deal.driver_id/shipper_id, не из params', () => {
  // Старый код: `const role = params.role || session?.user?.role || 'client';`
  // — params.role приходит из навигации и может быть неверным (guest, stale).
  // Новый код: useMemo сравнивает session.user.id с deal.driver_id/shipper_id.
  assert.ok(
    workspace.includes('deal?.driver_id') && workspace.includes('deal?.shipper_id'),
    'DealWorkspaceScreenV2: роль должна выводиться из deal.driver_id/shipper_id, а не из params.role',
  );
  assert.ok(
    workspace.includes('React.useMemo'),
    'DealWorkspaceScreenV2: вычисление роли должно быть мемоизировано (useMemo)',
  );
});

test('P1 (#281): все deal-эндпоинты проверяют ownership (IDOR-контракт)', () => {
  // Каждый deal-endpoint с deal_id обязан проверять shipper_id/driver_id.
  // Для путей с несколькими handlers (GET+POST) проверяем ВСЕ блоки.
  const dealRoutes = [
    '/deals/{deal_id}',
    '/deals/{deal_id}/status',
    '/deals/{deal_id}/tracking',
    '/deals/{deal_id}/location',
  ];
  for (const route of dealRoutes) {
    const escaped = route.replace(/[{}]/g, '\\$&');
    // matchAll чтобы поймать все handlers с одинаковым путём (GET+POST)
    const re = new RegExp(`@mp_router\\.[a-z]+\\("${escaped}"\\)[\\s\\S]*?(?=@mp_router|$)`, 'g');
    const blocks = [...marketPy.matchAll(re)].map((m) => m[0]);
    assert.ok(blocks.length > 0, `не найден handler для ${route}`);
    for (const block of blocks) {
      const hasOwnerCheck =
        (block.includes('shipper_id') || block.includes('driver_id')) &&
        (block.includes('not in (') || block.includes('!= user'));
      assert.ok(hasOwnerCheck, `${route}: нет проверки ownership (shipper_id/driver_id)`);
    }
  }
});

test('P2: guard снятия с публикации знает про delivered/received', () => {
  const guards = [...marketPy.matchAll(/SELECT id FROM deals WHERE (?:cargo_id|trip_id) = \? AND status IN \(([^)]*)\)/g)];
  assert.equal(guards.length, 2, 'ожидалось два guard-запроса (cargo + trip)');
  for (const g of guards) {
    for (const s of ['delivered', 'received']) {
      assert.ok(g[1].includes(`'${s}'`), `guard не покрывает статус ${s}: ${g[1]}`);
    }
  }
});
