// Рабочие маршруты регистрируются только после входа и выбора роли.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync('src/navigation/AppNavigator.js', 'utf8');
const start = src.indexOf("{navKey !== 'main' ? (");
const end = src.indexOf(') : (', start);
assert.ok(start > 0 && end > start, 'Не найдена граница стека входа');
const authStack = src.slice(start, end);
const mainStack = src.slice(end);
for (const route of ['Main', 'CargoDetail', 'TripDetail', 'DriverDetail', 'Chat', 'Profile']) {
  assert.doesNotMatch(authStack, new RegExp(`name=["']${route}["']`), `${route} доступен до входа`);
  assert.match(mainStack, new RegExp(`name=["']${route}["']`), `${route} отсутствует после входа`);
}
assert.match(authStack, /name="PhoneV2"/);
console.log('nav-contract OK: рабочие маршруты закрыты до входа');
