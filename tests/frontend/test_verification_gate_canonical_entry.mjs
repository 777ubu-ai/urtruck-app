// Регрессия P2 (release/reconcile-20260901 §8) — случайное действие в
// ленте/карточке груза (тап "откликнуться", "опубликовать" и т.п.) вело
// НАСТОЯЩЕГО гостя (verificationLevel < 1, identity ещё не установлена)
// напрямую в legacy phone/SMS регистрацию, в обход канонического
// Google/Apple/Email экрана.
//
// Механизм: VerificationGate.handleProceed при наличии roleHint (обычный
// случай для действий в ленте — Feed передаёт driver/client по контексту
// вкладки) шёл ПРЯМО в 'Reg' (PremiumRegisterScreen — чистый phone/SMS,
// её собственный докстринг прямо говорит "НЕТ Apple/Google"), минуя и
// 'Role', и канонический 'PhoneV2' (Google+Apple+Email — единственный
// утверждённый способ входа, phone там больше не таб входа).
//
// Фикс: для verificationLevel < 1 (гость без вообще какой-либо identity)
// действие с roleHint теперь ведёт в 'PhoneV2', роль передаётся тем же
// параметром {role}, что PhoneV2Screen уже умеет читать и донести дальше.
// Уже частично верифицированные пользователи (level >= 1) — ветка не
// менялась, legacy-аккаунты не ломаются.
//
// Run: node --experimental-loader ./tests/frontend/loader.mjs --test \
//        tests/frontend/test_verification_gate_canonical_entry.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const gateSrc = readFileSync('src/components/VerificationGate.js', 'utf8');
const navSrc = readFileSync('src/navigation/AppNavigator.js', 'utf8');
const phoneV2Src = readFileSync('src/screens/onboarding/PhoneV2Screen.js', 'utf8');

test('гость (level < 1) с roleHint из ленты ведётся в канонический PhoneV2, не в legacy Reg', () => {
  const idx = gateSrc.indexOf('const handleProceed = useCallback');
  assert.ok(idx > 0, 'handleProceed должен существовать');
  const block = gateSrc.slice(idx, idx + 1400);
  assert.match(block, /const target = inferredRole\s*\n?\s*\?\s*\(verificationLevel < 1 \? 'PhoneV2' : 'Reg'\)/,
    'guest c roleHint обязан идти в PhoneV2, не в Reg напрямую');
});

test('роль передаётся тем же {role} параметром, что уже понимает PhoneV2Screen', () => {
  assert.match(gateSrc, /navigation\.navigate\(target, inferredRole \? \{ role: inferredRole \} : undefined\)/);
  assert.match(phoneV2Src, /const role = route\?\.params\?\.role \|\| null/,
    'PhoneV2Screen обязан уметь прочитать переданную роль — иначе контекст (грузы/рейсы) потеряется');
});

test('canonical PhoneV2 действительно Google+Apple+Email, без phone-таба (не заменили одну legacy-дверь на другую)', () => {
  assert.match(phoneV2Src, /Google \+ Apple \+ Email are the only login\s*\n\/\/ methods shown here/);
});

test('legacy Reg (PremiumRegisterScreen) остаётся зарегистрированным маршрутом — существующие аккаунты/ссылки не ломаем', () => {
  assert.match(navSrc, /name="Reg" component=\{PremiumRegisterScreen\}/);
  assert.match(navSrc, /name="PhoneV2" component=\{PhoneV2Screen\}/);
});
