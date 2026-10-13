import test from 'node:test';
import assert from 'node:assert/strict';
import { onboardingNavKey } from '../../src/utils/onboardingNavKey.js';

test('гость с токеном после перезапуска начинает с входа, а не профиля', () => {
  assert.equal(onboardingNavKey({ hasToken: true, session: { user: {} }, hasRole: false, verificationLevel: 0 }), 'guest');
});
test('подтверждённый вход без роли открывает выбор роли', () => {
  assert.equal(onboardingNavKey({ hasToken: true, session: { user: {} }, hasRole: false, verificationLevel: 1 }), 'norole');
});
test('сохранённая роль не меняет существующий путь входа', () => {
  for (const level of [0, 1, 2, 3]) assert.equal(onboardingNavKey({ hasToken: true, session: { user: { role: 'driver' } }, hasRole: true, verificationLevel: level }), 'main');
});
test('без токена или сессии всегда нужен вход', () => {
  assert.equal(onboardingNavKey({ hasToken: false, session: {}, hasRole: true, verificationLevel: 2 }), 'guest');
  assert.equal(onboardingNavKey({ hasToken: true, session: null, hasRole: true, verificationLevel: 2 }), 'guest');
});
