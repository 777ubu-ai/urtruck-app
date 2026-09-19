// Финальный аудит §34 ERROR UX (2026-09-14).
//
// Root cause: marketAPI.listCargos / listTrips НЕ бросают при сетевой ошибке
// или 5xx — они возвращают `{ cargos: [], total: 0, serverError: true }`
// (см. src/utils/marketAPI.js), чтобы экран мог отличить «ничего не нашлось»
// от «сервер недоступен». FeedScreen.js этот флаг проверял, CargoFeedScreen.js
// (ГЛАВНАЯ вкладка водителя, «Грузы») — нет: catch не срабатывал, `error`
// оставался false, и при HTTP 500 / 502 / offline / timeout водитель видел
// «Подходящих грузов пока нет» вместо ошибки и без кнопки «Повторить».
// Ветка error в ListEmptyComponent была полностью мёртвой.
// Подтверждено рантаймом (Playwright: route abort + route fulfill 500).
//
// Этот тест держит ОБА фида в симметрии: пока listCargos/listTrips возвращают
// serverError-флаг вместо throw, экран обязан его проверять.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const marketAPI = read('../../src/utils/marketAPI.js');
const cargoFeed = read('../../src/screens/CargoFeedScreen.js');
const tripFeed = read('../../src/screens/FeedScreen.js');

test('marketAPI list endpoints signal failure via serverError instead of throwing', () => {
  // Если это когда-нибудь начнёт бросать — проверки ниже станут излишними,
  // но тогда и падение здесь заставит пересмотреть контракт осознанно.
  assert.match(marketAPI, /cargos:\s*\[\],\s*total:\s*0,\s*serverError:\s*true/);
  assert.match(marketAPI, /trips:\s*\[\],\s*total:\s*0,\s*serverError:\s*true/);
});

test('CargoFeedScreen turns serverError into the error state (regression)', () => {
  const load = cargoFeed.match(/const load = useCallback\(async \(\) => \{[\s\S]*?\n  \}, \[/);
  assert.ok(load, 'load() must be present in CargoFeedScreen');
  assert.match(load[0], /result\?\.serverError/,
    'CargoFeedScreen.load() must inspect result.serverError — иначе 500/offline выглядит как «грузов нет»');
  // Флаг обязан попасть именно в catch → setError(true), а не быть просто
  // прочитанным: проверяем, что он бросает внутри try.
  assert.match(load[0], /if \(result\?\.serverError\) throw new Error\(/);
  assert.match(load[0], /catch[\s\S]*setError\(true\)/);
});

test('FeedScreen keeps the same serverError guard', () => {
  const load = tripFeed.match(/const load = useCallback\(async \(\) => \{[\s\S]*?\n  \}, \[/);
  assert.ok(load, 'load() must be present in FeedScreen');
  assert.match(load[0], /if \(result\?\.serverError\) throw new Error\(/);
  assert.match(load[0], /catch[\s\S]*setError\(true\)/);
});

test('both feeds render a localized load error plus a retry affordance', () => {
  for (const [name, src] of [['CargoFeedScreen', cargoFeed], ['FeedScreen', tripFeed]]) {
    assert.match(src, /error \? copy\.loadError : copy\.empty/, `${name}: error branch must swap in loadError`);
    assert.match(src, /error \? \(\s*<TouchableOpacity/, `${name}: error branch must offer retry`);
    assert.match(src, /onPress=\{load\}/, `${name}: retry must re-run load()`);
    // Локализация ошибки во всех четырёх языках приложения.
    assert.equal((src.match(/loadError:/g) || []).length, 4,
      `${name}: loadError must exist for all 4 locales (ru/en/zh/kk)`);
  }
});

test('no raw error object is ever rendered to the user in either feed', () => {
  for (const [name, src] of [['CargoFeedScreen', cargoFeed], ['FeedScreen', tripFeed]]) {
    // Никогда не показываем e.message / error.message / detail в Text —
    // это канал утечки traceback/SQL/провайдерского ответа.
    assert.doesNotMatch(src, /<Text[^>]*>\s*\{[^}]*\b(?:e|err|error)\.message/,
      `${name}: raw exception message must never reach a <Text>`);
    assert.doesNotMatch(src, /<Text[^>]*>\s*\{[^}]*\bresult\.detail/,
      `${name}: raw server detail must never reach a <Text>`);
  }
});
