// Регрессия P1 (release/reconcile-20260901 §5) — в профиле был только
// Light/Dark, без варианта "Система"; параллельно в проекте жили ДВА
// независимых резолвера темы (ThemeContext.js — инлайн-копия логики,
// themeResolve.js — отдельная, юнит-тестируемая, но никуда не подключённая).
//
// Фикс: ThemeContext.js теперь ЕДИНСТВЕННЫЙ потребитель resolveTheme() —
// третий resolver НЕ создан, использован уже существующий. Канонический
// themeMode — 'system' (не 'auto'), legacy 'auto' читается и нормализуется.
// В ProfileScreen добавлена явная 3-я кнопка.
//
// Run: node --experimental-loader ./tests/frontend/loader.mjs --test \
//        tests/frontend/test_theme_system_option.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveTheme } from '../../src/utils/themeResolve.js';

const contextSrc = readFileSync('src/utils/ThemeContext.js', 'utf8');
const profileSrc = readFileSync('src/screens/ProfileScreen.js', 'utf8');
const i18nSrc = readFileSync('src/utils/i18n.js', 'utf8');

test('ThemeContext: единственный резолвер — импортирует и вызывает resolveTheme(), не дублирует логику', () => {
  assert.match(contextSrc, /import \{ resolveTheme \} from '\.\/themeResolve'/);
  assert.match(contextSrc, /resolveTheme\(themeMode,\s*systemDark\)/);
  // Старая инлайн-копия той же логики не должна вернуться.
  assert.doesNotMatch(contextSrc, /themeMode === 'dark' \|\| \(themeMode === 'auto' && systemDark\)/);
});

test('ThemeContext: канонический режим — "system", legacy "auto" нормализуется на чтении', () => {
  assert.match(contextSrc, /themeMode: 'system'/);
  assert.match(contextSrc, /normalizeMode = \(mode\) => \(mode === 'auto' \? 'system' : mode\)/);
});

test('resolveTheme (единственный источник истины) корректно резолвит все три режима', () => {
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
  assert.equal(resolveTheme('auto', true), 'dark', 'legacy auto должен продолжать работать без миграции БД');
});

test('ProfileScreen: три явные кнопки Light/Dark/System, управляют themeMode напрямую', () => {
  assert.match(profileSrc, /const \{ isDark, themeMode, setThemeMode \} = useTheme\(\)/);
  assert.match(profileSrc, /testID="theme-toggle-light"/);
  assert.match(profileSrc, /testID="theme-toggle-dark"/);
  assert.match(profileSrc, /testID="theme-toggle-system"/);
  assert.match(profileSrc, /onPress=\{\(\) => setThemeMode\('light'\)\}/);
  assert.match(profileSrc, /onPress=\{\(\) => setThemeMode\('dark'\)\}/);
  assert.match(profileSrc, /onPress=\{\(\) => setThemeMode\('system'\)\}/);
});

test('i18n: theme_system присутствует во всех 4 языках', () => {
  const count = (i18nSrc.match(/theme_system:/g) || []).length;
  assert.equal(count, 7, 'theme_system должен быть добавлен рядом с каждым существующим блоком theme_dark (7 блоков — некоторые языки дублируют ключ в двух местах файла)');
});
