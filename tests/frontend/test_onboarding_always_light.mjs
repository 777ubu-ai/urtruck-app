// Регрессия P1 (release/reconcile-20260901 §4) — онбординг обязан быть
// ВСЕГДА Light, независимо от ThemeContext.isDark.
//
// Баг: OnboardingV2Screen.js:147 звал `useBrand()`, который в theme/brandV2.js
// возвращает `isDark ? brandDark : brandLight` — реагирует на системную
// тёмную тему ИЛИ ранее выбранный пользователем Dark в профиле (persisted
// в storage['ur_theme']). Пользователь, однажды переключивший тему на Dark,
// видел тёмный онбординг при повторном прохождении (logout/reinstall).
//
// Фикс: `_b = brandLight` — статический импорт, не хук; isDark физически
// не может повлиять на выбор палитры. Плюс отдельные inline-обращения к
// реактивному Proxy `brand.X` заменены на `_b.X`/`brandLight.X`. Плюс
// добавлен локальный <StatusBar style="dark"/> — глобальный в App.js
// стоит "light" (белые иконки, рассчитан на тёмные экраны приложения),
// на белом фоне онбординга был бы невидим.
//
// Run: node --experimental-loader ./tests/frontend/loader.mjs --test \
//        tests/frontend/test_onboarding_always_light.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync('src/screens/onboarding/OnboardingV2Screen.js', 'utf8');
const brandSrc = readFileSync('src/theme/brandV2.js', 'utf8');

test('онбординг импортирует статический brandLight, а не реактивный useBrand', () => {
  assert.match(src, /import \{ brandLight, radius, typography \} from '\.\.\/\.\.\/theme\/brandV2'/);
  assert.match(src, /const _b = brandLight;/);
  assert.doesNotMatch(src, /useBrand\(\)/, 'useBrand() реагирует на isDark — не должен вызываться в онбординге');
  assert.doesNotMatch(src, /import \{ brand,/, 'реактивный Proxy brand не должен импортироваться сюда вообще');
});

test('никакой JSX/стиль в файле не читает isDark-реактивный Proxy напрямую', () => {
  // Единственное легитимное появление слова "brand." — параметр функции
  // makeStyles(brand) (шэдоуит любой внешний импорт), не сам Proxy.
  assert.match(src, /const makeStyles = \(brand\) => StyleSheet\.create/);
  // Явных обращений к глобальному Proxy-экспорту `brand` (не через _b/
  // brandLight/параметр makeStyles) в файле не осталось.
  const withoutMakeStylesParamUsage = src.replace(/const makeStyles = \(brand\) => StyleSheet\.create\([\s\S]*?\}\);/, '');
  assert.doesNotMatch(withoutMakeStylesParamUsage, /[^_.]\bbrand\./, 'вне makeStyles(brand) не должно остаться прямых brand.X обращений к реактивному Proxy');
});

test('brandLight экспортирован из theme/brandV2.js как именованный экспорт', () => {
  assert.match(brandSrc, /export \{ brandLight \};/);
});

test('локальный StatusBar dark перекрывает глобальный light для белого фона', () => {
  assert.match(src, /import \{ StatusBar \} from 'expo-status-bar'/);
  assert.match(src, /<StatusBar style="dark" \/>/);
});

test('исходные изображения слайдов не зависят от темы (статичные require)', () => {
  assert.match(src, /const HERO_SLIDE_1 = require\('\.\.\/\.\.\/\.\.\/assets\/onboarding\/slide-1-hero\.jpg'\)/);
  assert.match(src, /const HERO_SLIDE_2 = require\('\.\.\/\.\.\/\.\.\/assets\/onboarding\/slide-2-driver-1\.jpg'\)/);
  assert.match(src, /const HERO_SLIDE_3 = require\('\.\.\/\.\.\/\.\.\/assets\/onboarding\/slide-2-driver-2\.jpg'\)/);
});
