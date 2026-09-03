/**
 * P0 2026-09-03 — Regression: BID-уведомление гаснет после открытия.
 *
 * Физический QA: Fedya создаёт ставку → Boris получает system push → тап
 * открывает правильный экран → unread остаётся 1, бейдж не гаснет.
 * При ACCEPT и CHAT то же самое работает (reference PASS).
 *
 * Первопричина: гашение делает СЕРВЕР как side-effect загрузки сущности
 * (GET /cargos/{id}, GET /trips/{id}), и оба блока gated условием
 * `if caller and caller.get("id")`. Эндпоинты optional-auth, поэтому
 * анонимный запрос отдаёт карточку, но гашение молча пропускает.
 * marketAPI.getCargo/getTrip вызывали authedFetch БЕЗ headers —
 * `authedFetch` (utils/authEvents.js) вопреки имени лишь оборачивает fetch
 * таймаутом и side-effect'ом на 401, Authorization он НЕ подставляет.
 *
 * ACCEPT маскировал дефект: там уже есть сделка, и экран дополнительно
 * грузит строго-авторизованный GET /deals/{id}, гасящий и /cargos/{id}.
 *
 * Поведенческая часть доказана в
 * backend/tests/test_bid_notification_read_lifecycle.py (аноним не гасит /
 * авторизованный гасит). Здесь фиксируется фронтенд-контракт.
 *
 * Run: node tests/frontend/test_bid_unread_clear_contract.mjs
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

const marketAPI = read('src/utils/marketAPI.js');
const authEvents = read('src/utils/authEvents.js');
const cargoDetail = read('src/screens/CargoDetail.js');
const tripDetail = read('src/screens/TripDetail.js');
const unreadHook = read('src/utils/useUnreadNotifications.js');
const marketplacePy = read('backend/api/marketplace.py');

console.log('\n=== 1. authedFetch НЕ подставляет токен — заголовки обязан дать вызывающий ===');
{
  // Это и есть ловушка, из-за которой дефект выглядел безобидно.
  const fn = authEvents.match(/export async function authedFetch[\s\S]*?\n\}/);
  expect(!!fn, 'authedFetch найден в utils/authEvents.js');
  if (fn) {
    expect(
      !/Authorization/.test(fn[0]),
      'authedFetch не добавляет Authorization сам (иначе вызывающим он не нужен)'
    );
  }
}

console.log('\n=== 2. getCargo / getTrip присылают Authorization ===');
for (const [name, re] of [
  ['getCargo', /async getCargo\(id\)\s*\{\s*const r = await authedFetch\(`\$\{BASE\}\/cargos\/\$\{id\}`,\s*\{\s*headers: await headers\(\)\s*\}\)/],
  ['getTrip', /async getTrip\(id\)\s*\{\s*const r = await authedFetch\(`\$\{BASE\}\/trips\/\$\{id\}`,\s*\{\s*headers: await headers\(\)\s*\}\)/],
]) {
  expect(re.test(marketAPI), `${name}() передаёт headers: await headers() — иначе серверное гашение пропускается`);
}

console.log('\n=== 3. headers() остаётся guest-safe (гостевой просмотр не сломан) ===');
{
  const h = marketAPI.match(/async function headers\(\)[\s\S]*?\n\}/);
  expect(!!h, 'headers() найден');
  if (h) {
    expect(
      /\.\.\.\(token \? \{ 'Authorization': `Bearer \$\{token\}` \} : \{\}\)/.test(h[0]),
      'Authorization добавляется ТОЛЬКО при наличии токена (гость шлёт запрос без него)'
    );
  }
}

console.log('\n=== 4. Серверное гашение действительно требует авторизованного caller ===');
{
  // Фиксируем причину, по которой заголовок критичен: без caller — no-op.
  for (const entity of ['cargos', 'trips']) {
    const idx = marketplacePy.indexOf(`@mp_router.get("/${entity}/{`);
    expect(idx !== -1, `GET /${entity}/{id} найден в backend`);
    if (idx !== -1) {
      const block = marketplacePy.slice(idx, idx + 3000);
      expect(
        /if caller and caller\.get\("id"\):/.test(block)
          && block.includes('mark_notifications_read_by_urls'),
        `GET /${entity}/{id}: гашение уведомлений gated на авторизованном caller`
      );
      expect(
        /_maybe_user\(authorization\)/.test(block),
        `GET /${entity}/{id}: optional-auth (_maybe_user) — анонимный запрос НЕ падает, просто не гасит`
      );
    }
  }
}

console.log('\n=== 5. Бейдж обновляется сразу, как у reference PASS (ACCEPT/CHAT) ===');
{
  for (const [name, src] of [['CargoDetail.js', cargoDetail], ['TripDetail.js', tripDetail]]) {
    expect(
      /import \{ notifyNotifRead \} from '\.\.\/utils\/unreadEvents'/.test(src),
      `${name}: импортирует notifyNotifRead`
    );
    expect(
      /notifyNotifRead\(\)/.test(src),
      `${name}: эмитит notifyNotifRead() после загрузки карточки`
    );
  }
  // notifyNotifRead должен вызываться внутри .then загрузки сущности,
  // а не на mount — иначе счётчик перечитается ДО серверного гашения.
  const cargoThen = cargoDetail.match(/marketAPI\.getCargo\(cid\)\.then\([\s\S]{0,400}?\}\)/);
  expect(
    !!cargoThen && cargoThen[0].includes('notifyNotifRead()'),
    'CargoDetail: notifyNotifRead() вызывается в .then(getCargo) — после серверного гашения'
  );
  const tripThen = tripDetail.match(/marketAPI\.getTrip\(tid\)\.then\([\s\S]{0,400}?\}\)/);
  expect(
    !!tripThen && tripThen[0].includes('notifyNotifRead()'),
    'TripDetail: notifyNotifRead() вызывается в .then(getTrip)'
  );
}

console.log('\n=== 6. Бейдж читает канонический серверный unread, а не локальный счётчик ===');
{
  expect(
    /notificationsAPI\.unread\(\)/.test(unreadHook),
    'useUnreadNotifications берёт счётчик с сервера (canonical), а не из локального стора'
  );
  expect(
    /subscribeNotifRead\(fetchCount\)/.test(unreadHook),
    'хук подписан на notifyNotifRead → мгновенный re-fetch вместо ожидания поллинга'
  );
  expect(
    /AppState\.addEventListener/.test(unreadHook),
    'счётчик перечитывается при возврате приложения в active'
  );
}

console.log('\n=== 7. Не появилось «гашения всего» ===');
{
  // Требование владельца: не делать глобальный clear-all при открытии экрана.
  for (const [name, src] of [['CargoDetail.js', cargoDetail], ['TripDetail.js', tripDetail]]) {
    expect(
      !/readAll|read-all|markAllRead/i.test(src),
      `${name}: не вызывает read-all (гасятся только уведомления этого пути, на сервере)`
    );
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
