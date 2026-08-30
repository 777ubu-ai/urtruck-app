// Регрессия P0 auth-fix 28.08.2026 («двойной тап Google»).
//
// Баг: App.js не имел глобального Linking-слушателя; возврат из OAuth ловили
// только смонтированные экраны. На native callback-событие, пришедшее в
// «мёртвое окно» перезапуска (AuthContext.loading → карусель), терялось —
// пользователь падал на OnboardingV2 и был вынужден жать Google второй раз.
//
// Фикс: module-level буфер в socialAuth.js + подписка на уровне модуля в
// App.js + потребление буфера при монтировании OnboardingV2/PhoneV2.
//
// Run: node --experimental-loader ./tests/frontend/loader.mjs --test \
//        tests/frontend/test_social_auth_callback_buffer.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  captureSocialCallbackUrl,
  takeBufferedSocialCallbackUrl,
} from '../../src/utils/socialAuth.js';

const CALLBACK = 'urtruck://auth-social#access_token=x&refresh_token=y';
const WEB_CALLBACK = 'https://urtruck.kz/?social_auth=1&code=abc';

// ── функциональные: семантика буфера ────────────────────────

test('буфер: захватывает callback-URL и отдаёт его ровно один раз', () => {
  takeBufferedSocialCallbackUrl(); // очистить возможный残 state
  captureSocialCallbackUrl(CALLBACK);
  assert.equal(takeBufferedSocialCallbackUrl(), CALLBACK, 'первый take возвращает URL');
  assert.equal(takeBufferedSocialCallbackUrl(), null, 'второй take — null (одноразовый, как сам код)');
});

test('буфер: web-форму callback (social_auth=1) тоже принимает', () => {
  captureSocialCallbackUrl(WEB_CALLBACK);
  assert.equal(takeBufferedSocialCallbackUrl(), WEB_CALLBACK);
});

test('буфер: посторонние URL игнорирует (пуш-диплинки не перехватываются)', () => {
  takeBufferedSocialCallbackUrl();
  captureSocialCallbackUrl('https://urtruck.kz/cargos/abc?bid=1');
  captureSocialCallbackUrl('urtruck://deals/xyz');
  captureSocialCallbackUrl(null);
  captureSocialCallbackUrl(undefined);
  assert.equal(takeBufferedSocialCallbackUrl(), null, 'ничего из этого не должно попасть в буфер');
});

test('буфер: более поздний callback перезаписывает ранний (актуальный код)', () => {
  captureSocialCallbackUrl(CALLBACK);
  captureSocialCallbackUrl(WEB_CALLBACK);
  assert.equal(takeBufferedSocialCallbackUrl(), WEB_CALLBACK);
});

// ── статические: проводка в App.js и экранах не удалена ─────

const appSrc = readFileSync('App.js', 'utf8');
const onbSrc = readFileSync('src/screens/onboarding/OnboardingV2Screen.js', 'utf8');
const phoneSrc = readFileSync('src/screens/onboarding/PhoneV2Screen.js', 'utf8');

test('App.js: подписка на Linking НА УРОВНЕ МОДУЛЯ, до компонента App', () => {
  assert.match(appSrc, /captureSocialCallbackUrl/, 'App.js должен импортировать и звать captureSocialCallbackUrl');
  const subIdx = appSrc.indexOf('captureSocialCallbackUrl(url)');
  const appCmpIdx = appSrc.search(/function AppInner|function App\b|const App\s*=/);
  assert.ok(subIdx > 0, 'вызов captureSocialCallbackUrl(url) присутствует');
  assert.ok(appCmpIdx > 0, 'компонент App найден');
  assert.ok(subIdx < appCmpIdx,
    'подписка обязана быть ВЫШЕ определения компонента (module scope) — иначе мёртвое окно возвращается');
});

test('OnboardingV2: при монтировании забирает буфер', () => {
  assert.match(onbSrc, /takeBufferedSocialCallbackUrl/, 'OnboardingV2 должен потреблять буфер');
});

test('PhoneV2: при монтировании забирает буфер', () => {
  assert.match(phoneSrc, /takeBufferedSocialCallbackUrl/, 'PhoneV2 должен потреблять буфер');
});
