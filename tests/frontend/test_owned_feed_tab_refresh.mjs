import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

for (const screen of ['CargoFeedScreen.js', 'FeedScreen.js']) {
  test(`${screen}: возврат на вкладку обновляет объявления, возврат из карточки не сбрасывает список`, () => {
    const source = readFileSync(`src/screens/${screen}`, 'utf8');
    const match = source.match(/useEffect\(\(\) => navigation\.addListener\('tabPress', \(\) => \{\s*load\(\);\s*\}\), \[navigation, load\]\);/);
    assert.ok(match, 'Нет обновления списка при выборе вкладки');
    let listener; let calls = 0; let unsubscribed = false;
    const navigation = { addListener(type, fn) { assert.equal(type, 'tabPress'); listener = fn; return () => { unsubscribed = true; }; } };
    const cleanup = new Function('useEffect', 'navigation', 'load', 'return ' + match[0])((effect) => effect(), navigation, () => { calls++; });
    assert.equal(calls, 0, 'Подписка не должна заменять начальную загрузку');
    listener(); assert.equal(calls, 1, 'Выбор вкладки обновляет данные');
    assert.ok(source.includes('useFocusEffect(useCallback(() => {'), 'Отдельный возврат из карточки должен сохранять позицию');
    assert.equal(typeof cleanup, 'function'); cleanup(); assert.equal(unsubscribed, true);
  });
}
