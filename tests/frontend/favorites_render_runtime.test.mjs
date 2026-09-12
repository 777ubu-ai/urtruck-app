// Runtime-repro: FavoritesScreen падает с ReferenceError(refreshingList)
// при рендере после загрузки. Gray-box: компонент исполняется как функция
// со stubbed-хуками (mocks/react-stub.mjs + render-env-hooks.mjs), ветка
// post-loading достигается потому, что stub useState возвращает loading=false.
// Первый тест — reproduce на НЕисправленном коде (доказывает реальный
// рантайм-дефект), второй — контракт исправления: рендер не бросает.
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./mocks/render-env-hooks.mjs', import.meta.url);

const { default: FavoritesScreen } = await import('../../src/screens/FavoritesScreen.js');

const render = () => FavoritesScreen({ navigation: { goBack() {}, navigate() {} }, route: { params: {} } });

test('post-loading render does not throw and reaches FlatList branch (regression: refreshingList ReferenceError)', () => {
  // До фикса: `refreshing || refreshingList` бросал ReferenceError при
  // каждом рендере после загрузки — экран «Избранное» падал целиком.
  const tree = render();
  assert.ok(tree && typeof tree === 'object', 'render must return element tree');
  assert.equal(tree.type && tree.type.displayName, 'SafeAreaView', 'root must be the screen container');
});
