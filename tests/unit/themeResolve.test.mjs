// Unit-тесты системы темы UrTruck (P1 fix 2026-08): переключатель light/dark
// должен работать с приоритетом ручного выбора над системным.
//
//   node tests/unit/themeResolve.test.mjs
import { resolveTheme } from '../../src/utils/themeResolve.js';

let failed = 0;
function check(desc, actual, expected) {
  const ok = actual === expected;
  console.log((ok ? '  ok: ' : 'FAIL: ') + desc + ` (got ${actual}, expected ${expected})`);
  if (!ok) failed++;
}

// TEST 1 — дефолт (system, светлая система) → light
check('default system + light OS -> light', resolveTheme('system', false), 'light');
// TEST 2/3 — ручное переключение
check('manual dark -> dark', resolveTheme('dark', false), 'dark');
check('manual light -> light', resolveTheme('light', true), 'light');
// TEST 8 — system следует за OS
check('system + dark OS -> dark', resolveTheme('system', true), 'dark');
check('system + light OS -> light', resolveTheme('system', false), 'light');
// TEST 9 — ручной выбор ПОБЕЖДАЕТ системную тему
check('manual light beats OS dark', resolveTheme('light', true), 'light');
check('manual dark beats OS light', resolveTheme('dark', false), 'dark');
// legacy 'auto' == 'system'
check('legacy auto + dark OS -> dark', resolveTheme('auto', true), 'dark');
check('legacy auto + light OS -> light', resolveTheme('auto', false), 'light');
// защита от undefined
check('undefined mode + dark OS -> dark', resolveTheme(undefined, true), 'dark');

console.log(failed === 0 ? '\nAll theme resolve tests passed.' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
