// §15 (ERROR UX / I18N P2 CLEANUP), AGENT D hardening pass (2026-09-14).
//
// Pins the concrete hardcoded-string leaks found and fixed in this pass.
// An earlier session's notes claimed two of these (HeaderMenuButton a11y
// label, PriceSavingsBadge) were already fixed — a fresh grep on this HEAD
// found both still hardcoded RU, alongside marketAPI.js/registration.js/
// vehicleAPI.js's raw-status / raw-e.message fallbacks and the Android
// push-channel name. All are fixed here; this test keeps them fixed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const i18n = readFileSync('src/utils/i18n.js', 'utf8');
const marketAPI = readFileSync('src/utils/marketAPI.js', 'utf8');
const registration = readFileSync('src/utils/registration.js', 'utf8');
const vehicleAPI = readFileSync('src/utils/vehicleAPI.js', 'utf8');
const headerMenuButton = readFileSync('src/components/ui/v1/HeaderMenuButton.js', 'utf8');
const priceSavingsBadge = readFileSync('src/components/deal/PriceSavingsBadge.js', 'utf8');
const push = readFileSync('src/utils/push.js', 'utf8');

test('new P2 i18n keys exist symmetrically in all 4 locales', () => {
  for (const key of ['error_with_status', 'menu_profile_a11y', 'price_savings_badge', 'push_channel_name']) {
    const count = (i18n.match(new RegExp(`\\b${key}:`, 'g')) || []).length;
    assert.equal(count, 4, `${key} must be defined exactly once per locale (RU/KK/ZH/EN) — found ${count}`);
  }
});

test('marketAPI.normalizeDetail no longer hardcodes "Ошибка {status}"', () => {
  assert.doesNotMatch(marketAPI, /`Ошибка \$\{status\}`/);
  assert.match(marketAPI, /tGlobal\('error_with_status'\)\.replace\('\{status\}', status\)/);
});

test('registration.js network-failure paths no longer leak raw e.message', () => {
  assert.doesNotMatch(registration, /e\?\.message \|\| 'network_error'/);
  const occurrences = (registration.match(/detail: tGlobal\('network_error'\)/g) || []).length;
  assert.equal(occurrences, 7, 'all 7 registration network catch blocks must route through tGlobal');
});

test('vehicleAPI.js request() no longer leaks raw error.message', () => {
  assert.doesNotMatch(vehicleAPI, /error\?\.message \|\| 'network_error'/);
  assert.match(vehicleAPI, /detail: tGlobal\('network_error'\)/);
});

test('HeaderMenuButton accessibilityLabel is localized, not hardcoded RU', () => {
  assert.doesNotMatch(headerMenuButton, /accessibilityLabel="Профиль и меню"/);
  assert.match(headerMenuButton, /accessibilityLabel=\{t\('menu_profile_a11y'\)\}/);
});

test('PriceSavingsBadge is localized, not hardcoded RU + ru-RU number formatting', () => {
  assert.doesNotMatch(priceSavingsBadge, /экономия \{cur\}/);
  assert.doesNotMatch(priceSavingsBadge, /toLocaleString\('ru-RU'\)/);
  assert.match(priceSavingsBadge, /t\('price_savings_badge'\)\.replace\('\{amount\}', amount\)/);
  assert.match(priceSavingsBadge, /formatPrice\(savings, currency, t\)/);
});

test('Android push notification channel name is localized, not hardcoded RU', () => {
  assert.doesNotMatch(push, /name: 'UrTruck сообщения'/);
  assert.match(push, /name: tGlobal\('push_channel_name'\)/);
});
