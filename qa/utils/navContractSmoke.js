// P1-10 (08.08.2026): nav-contract smoke. Гость (стек !hasToken||!session||
// !hasRole) должен иметь зарегистрированными read-only маршруты, на которые
// ведут тапы из ленты/шапки — иначе navigate() молча ничего не делает.
// Раньше TripDetail отсутствовал в гостевом стеке → тап по карточке машины
// был мёртвым. Тест защищает от регресса: ключевые view-маршруты обязаны
// быть в обеих ветках навигатора.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync('src/navigation/AppNavigator.js', 'utf8');

// Гостевая ветка — между маркером onboarding и `) : (` (полный стек).
const guestStart = src.indexOf('inDrive-style onboarding');
const guestEnd = src.indexOf(') : (', guestStart);
assert.ok(guestStart > 0 && guestEnd > guestStart, 'не нашёл границы гостевого стека в AppNavigator');
const guestStack = src.slice(guestStart, guestEnd);

// Маршруты, которые гость реально достигает тапом (лента машин/грузов, шапка,
// чат). CargoDetail + TripDetail — зеркальная пара (грузы/машины).
const REQUIRED_GUEST_ROUTES = ['CargoDetail', 'TripDetail', 'DriverDetail', 'Chat', 'Profile', 'Main'];
const missing = REQUIRED_GUEST_ROUTES.filter(
  (r) => !new RegExp(`name=["']${r}["']`).test(guestStack),
);
assert.equal(missing.length, 0, `Гостевой стек не регистрирует read-маршруты: ${missing.join(', ')} → тап молча не работает`);

console.log(`nav-contract OK: гостевой стек регистрирует ${REQUIRED_GUEST_ROUTES.join(', ')}`);
