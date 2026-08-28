// Регрессия: продуктовый UI-ввод OTP НЕ удалён и НЕ ослаблен.
//
// Контекст: Playwright desktop visual audit (qa/agents/onboarding.v2.release
// .spec.js) больше не печатает код в OTP-инпут напрямую, а обходит только
// этот шаг session-injection'ом — потому что скрытый controlled RN-web
// TextInput в headless Chromium не принимает программный ввод (pre-existing,
// не продукт-баг). Этот статический тест фиксирует, что сам продукт
// по-прежнему содержит рабочий UI-ввод OTP с авто-верификацией — чтобы
// обход в E2E-тесте нельзя было спутать с удалением фичи из приложения.
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const otp = readFileSync('src/screens/onboarding/OtpV2Screen.js', 'utf8');

test('OtpV2Screen сохраняет рабочий UI-ввод кода', () => {
  // Поле ввода с тем же testID, что использует E2E-тест.
  assert.match(otp, /testID="otp-v2-input"/, 'OTP-инпут должен присутствовать');
  // Контролируемое поле + обработчик ввода.
  assert.match(otp, /onChangeText=\{onChangeCode\}/, 'onChangeText должен быть подключён');
  assert.match(otp, /value=\{code\}/, 'поле контролируемое (value={code})');
  // Числовая клавиатура и ограничение длины.
  assert.match(otp, /keyboardType="number-pad"/);
  assert.match(otp, /maxLength=\{CODE_LEN\}/);
});

test('OtpV2Screen авто-верифицирует при полном коде', () => {
  // onChangeCode: при достижении длины кода вызывает verify(digits).
  assert.match(
    otp,
    /if \(digits\.length === CODE_LEN\)\s*\{\s*verify\(digits\);/,
    'при полном коде должен вызываться verify()',
  );
  // Кнопка «Подтвердить» тоже вызывает verify() и заблокирована на неполном коде.
  assert.match(otp, /onPress=\{\(\) => verify\(\)\}/);
  assert.match(otp, /disabled=\{loading \|\| code\.length < CODE_LEN\}/);
});

test('verify реально дергает backend verify-эндпоинт', () => {
  // verify() обращается к regAPI.verifyEmailCode / verifyCode — т.е. UI-путь
  // действительно ведёт к серверной проверке, а не заглушке.
  assert.match(otp, /regAPI\.verifyEmailCode\(identifier, c\)/);
  assert.match(otp, /regAPI\.verifyCode\(identifier, c\)/);
});
