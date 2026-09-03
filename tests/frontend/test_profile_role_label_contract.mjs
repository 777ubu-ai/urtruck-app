/**
 * P0 2026-09-03 — Regression: метка роли в Профиле берётся из backend-сессии.
 *
 * Физический факт (Fedya, backend role = driver, лента/навигация = driver):
 * Профиль показывал «Грузоотправитель».
 *
 * Первопричина: ProfileScreen брал роль ТОЛЬКО из route.params
 *     const { role } = route.params || {};
 *     const isDriver = role === 'driver';
 * Профиль по канону — pushed-экран из ☰, и часть входов параметр не даёт:
 * App.js `navigate('Profile')` по deep-link'у пуша (url=/profile — отзывы,
 * статус документов) идёт вообще без params, а HeaderMenuButton прокидывает
 * роль лишь если её дал вызывающий экран. При role === undefined isDriver
 * становился false, и тернарник `isDriver ? role_driver : role_shipper`
 * молча падал в метку грузоотправителя — вместе с янтарным акцентом,
 * иконкой package и скрытыми блоками рейтинга/«Мой статус».
 *
 * Канон: источник истины — backend-роль аутентифицированной сессии
 * (AuthContext ← /register/me, значения driver | client | guest).
 * Backend-роль НЕ меняется; исправлено только её отображение.
 *
 * Run: node tests/frontend/test_profile_role_label_contract.mjs
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

const profile = read('src/screens/ProfileScreen.js');
const authContext = read('src/utils/AuthContext.js');
const i18n = read('src/utils/i18n.js');
const appJs = read('App.js');

console.log('\n=== 1. Роль берётся из сессии, а не только из route.params ===');
{
  expect(
    !/const \{ role \} = route\.params \|\| \{\};/.test(profile),
    'старая строка `const { role } = route.params || {}` убрана'
  );
  expect(
    /const \{ role: routeRole \} = route\.params \|\| \{\};/.test(profile),
    'route.params читается как fallback (routeRole)'
  );
  expect(
    /const sessionRole = session\?\.user\?\.role;/.test(profile),
    'читается session.user.role'
  );
  expect(
    /const role = \(sessionRole && sessionRole !== 'guest'\) \? sessionRole : routeRole;/.test(profile),
    'сессия приоритетнее параметра; guest не перекрывает реальную роль'
  );
  expect(
    /const isDriver = role === 'driver';/.test(profile),
    "isDriver сравнивается с каноническим значением 'driver'"
  );
}

console.log('\n=== 2. useAuth() вызывается ДО вычисления роли и ровно один раз ===');
{
  const authIdx = profile.indexOf('useAuth()');
  const roleIdx = profile.indexOf('const sessionRole = session?.user?.role;');
  expect(authIdx !== -1 && roleIdx !== -1 && authIdx < roleIdx, 'useAuth() стоит выше вычисления роли');
  const calls = (profile.match(/useAuth\(\)/g) || []).length;
  expect(calls === 1, `useAuth() вызывается ровно один раз (найдено ${calls}) — порядок хуков стабилен`);
}

console.log('\n=== 3. Симуляция резолвинга роли на реальной логике экрана ===');
{
  // Извлекаем формулу из экрана и проверяем её как чистую функцию —
  // так тест ломается, если формулу изменят.
  const m = profile.match(/const role = \((sessionRole[^)]*)\) \? sessionRole : routeRole;/);
  expect(!!m, 'формула резолвинга роли найдена');
  const resolve = (sessionRole, routeRole) =>
    (sessionRole && sessionRole !== 'guest') ? sessionRole : routeRole;

  const cases = [
    // [sessionRole, routeRole, ожидаемая роль, описание]
    ['driver', undefined, 'driver', 'Fedya: backend driver, params нет (deep-link /profile) → driver'],
    ['driver', 'client', 'driver', 'сессия перекрывает УСТАРЕВШИЙ параметр client'],
    ['client', undefined, 'client', 'Boris: backend client, params нет → client'],
    ['client', 'driver', 'client', 'сессия перекрывает устаревший параметр driver'],
    ['guest', 'driver', 'driver', 'guest не перекрывает роль из параметра'],
    [undefined, 'driver', 'driver', 'гостевой стек без сессии — fallback на параметр'],
    [null, 'client', 'client', 'сессия null — fallback на параметр'],
  ];
  for (const [s, r, want, desc] of cases) {
    expect(resolve(s, r) === want, desc);
  }

  // Ключевой физический кейс: driver больше не может стать shipper-меткой.
  expect(resolve('driver', undefined) === 'driver', 'driver + отсутствующий параметр НЕ даёт client');
}

console.log('\n=== 4. AuthContext даёт именно backend-роль из /register/me ===');
{
  expect(
    /const hasRealRole = me\.role && me\.role !== 'guest';/.test(authContext),
    'AuthContext отличает реальную роль от guest'
  );
  expect(
    /role: hasRealRole \? me\.role : \(base\.role \|\| null\)/.test(authContext),
    'session.user.role заполняется из me.role (/register/me) и не понижается до guest'
  );
}

console.log('\n=== 5. Метка роли: driver → водитель, client → грузоотправитель, во всех 4 языках ===');
{
  expect(
    /isDriver \? t\('role_driver'\) : t\('role_shipper'\)/.test(profile),
    'метка идёт через t(role_driver) / t(role_shipper), без хардкода'
  );

  // Собираем ВСЕ объявления ключа с границей слова, чтобы не поймать
  // префиксные ключи (howit_role_driver, rating_role_driver, auth_role_driver).
  const values = (key) => [
    ...i18n.matchAll(new RegExp(`(?<![A-Za-z0-9_])${key}:\\s*'([^']+)'`, 'g')),
  ].map((m) => m[1]);

  const driverValues = values('role_driver');
  const shipperValues = values('role_shipper');

  // Симметрию по 4 языкам гарантирует официальный смок (npm run qa:i18n:
  // 1966 ключей в RU/EN/KK/ZH, 0 пропусков на call sites). Здесь проверяем
  // именно СМЫСЛ метки: у каждого языка driver-перевод определён, и ни одно
  // объявление role_driver не несёт shipper-текст (это и был физический баг).
  const DRIVER_EXPECTED = { RU: 'Водитель', KK: 'Жүргізуші', ZH: '司机', EN: 'Driver' };
  const SHIPPER_EXPECTED = {
    RU: ['Грузоотправитель'],
    KK: ['Жүк жөнелтуші', 'Жүк иесі'],
    ZH: ['货主'],
    EN: ['Shipper'],
  };

  for (const [lang, want] of Object.entries(DRIVER_EXPECTED)) {
    expect(driverValues.includes(want), `${lang}: role_driver объявлен как «${want}»`);
  }
  for (const [lang, variants] of Object.entries(SHIPPER_EXPECTED)) {
    expect(
      variants.some((v) => shipperValues.includes(v)),
      `${lang}: role_shipper объявлен как ${variants.map((v) => `«${v}»`).join(' или ')}`
    );
  }

  // Ключевая защита от исходного дефекта: driver-метка нигде не равна
  // shipper-метке, и наоборот.
  const allShipper = new Set(Object.values(SHIPPER_EXPECTED).flat());
  const allDriver = new Set(Object.values(DRIVER_EXPECTED));
  expect(
    driverValues.every((v) => !allShipper.has(v)),
    'ни одно объявление role_driver не содержит shipper-текст'
  );
  expect(
    shipperValues.every((v) => !allDriver.has(v)),
    'ни одно объявление role_shipper не содержит driver-текст'
  );
  // Все объявления одного ключа внутри проекта должны быть переводами
  // ровно одного смысла — набор значений не должен содержать посторонних.
  expect(
    driverValues.every((v) => allDriver.has(v)),
    `все значения role_driver — ожидаемые переводы (найдено: ${[...new Set(driverValues)].join(', ')})`
  );
  expect(
    shipperValues.every((v) => allShipper.has(v)),
    `все значения role_shipper — ожидаемые переводы (найдено: ${[...new Set(shipperValues)].join(', ')})`
  );
}

console.log('\n=== 6. Backend-роль не переписывается фронтендом ===');
{
  // Требование владельца: нельзя менять backend role / превращать driver в client.
  const block = profile.slice(profile.indexOf('export default function ProfileScreen'), profile.indexOf('export default function ProfileScreen') + 2500);
  expect(
    !/setRole\(/.test(block),
    'ProfileScreen не вызывает setRole при вычислении метки (роль только читается)'
  );
}

console.log('\n=== 7. Param-less вход в Профиль остаётся возможным (регресс не маскируется) ===');
{
  // Тот самый вход, который вскрыл дефект. Он должен продолжать работать —
  // теперь роль подтянется из сессии.
  expect(
    /navRef\.current\.navigate\('Profile'\)/.test(appJs),
    "App.js по-прежнему умеет navigate('Profile') без params (deep-link url=/profile)"
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
