// Регрессия P0-hotfix TestFlight 1.0.7 build18 (28.08.2026), §6.
//
// Баг: «Нижняя строка ввода сообщения в чате иногда пропадает». Root cause
// (DealWorkspaceScreenV2.js): FlatList сообщений сворачивал composer до
// тонкой ручки-хэндла на onScrollBeginDrag (ЛЮБОЙ скролл истории — самый
// обычный жест), а обратно разворачивался ТОЛЬКО ручным тапом по хэндлу —
// никакого авто-восстановления по окончании жеста или на "scroll to latest"
// не было. Итог: пользователь скроллит вверх прочитать историю — composer
// (микрофон/поле/emoji/attach/send) исчезает и не появляется сам.
//
// Фикс: composer по-прежнему сворачивается на время активного драга (даёт
// место для чтения — не убираем это осознанное поведение), но:
//   - onScrollEndDrag / onMomentumScrollEnd теперь разворачивают его сами;
//   - jumpLatest() («scroll to latest») тоже явно разворачивает composer.
// Плюс уже существовавшие (проверяем, что не регрессировали) пути
// «после отправки фото/голосового/документа» — composerCollapsed сбрасывался
// в false ДО await, что и остаётся правильным поведением.
//
// Run: node --experimental-loader ./tests/frontend/loader.mjs --test \
//        tests/frontend/test_deal_chat_composer_visibility.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');

test('composer: сворачивание на активный драг сохранено (не убрано целиком)', () => {
  assert.match(src, /onScrollBeginDrag=\{collapseComposer\}/,
    'намеренное поведение "меньше занимать места при активном скролле" — оставляем');
});

test('composer: окончание жеста скролла (drag/momentum) авто-разворачивает composer', () => {
  assert.match(src, /onScrollEndDrag=\{onMessageListScrollSettle\}/,
    'без этого composer остаётся свёрнутым после того, как пользователь отпустил палец');
  assert.match(src, /onMomentumScrollEnd=\{onMessageListScrollSettle\}/,
    'инерционная прокрутка (fling) должна тоже возвращать composer по окончании');
});

test('composer: onMessageListScrollSettle вызывает expandComposer', () => {
  const idx = src.indexOf('const onMessageListScrollSettle');
  assert.ok(idx > 0, 'хендлер должен существовать как отдельная функция (не инлайн)');
  const block = src.slice(idx, idx + 250);
  assert.match(block, /expandComposer\(\)/,
    'хендлер обязан явно разворачивать composer, а не просто существовать');
});

test('composer: jumpLatest ("прокрутить к последним") тоже разворачивает composer', () => {
  const idx = src.indexOf('const jumpLatest');
  assert.ok(idx > 0, 'jumpLatest должен существовать');
  const block = src.slice(idx, idx + 300);
  assert.match(block, /scrollToEnd/, 'должен по-прежнему скроллить к концу списка');
  assert.match(block, /expandComposer\(\)/,
    'ТЗ §6: composer обязан быть виден "после scroll-to-bottom" — jumpLatest это и есть явный scroll-to-bottom');
});

test('composer: после отправки фото/документа/локации/голоса не остаётся свёрнутым (существующая проводка не сломана)', () => {
  for (const fnName of ['sendPhoto', 'pickAndSendDocument', 'sendLocation']) {
    const idx = src.indexOf(`const ${fnName}`);
    assert.ok(idx > 0, `${fnName} должен существовать`);
    const block = src.slice(idx, idx + 400);
    assert.match(block, /setComposerCollapsed\(false\)/,
      `${fnName}: composer обязан разворачиваться при отправке вложения`);
  }
});
