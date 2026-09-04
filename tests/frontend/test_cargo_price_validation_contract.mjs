/**
 * P1-CARGO-VALIDATION-001 (nightly 04.09.2026) — frontend UX price guard.
 *
 * Backend теперь отвергает price < 0 на всех схемах (единый field_validator;
 * см. backend/tests/test_cargo_price_validation.py — 13 тестов). Backend —
 * финальный авторитет. Этот файл фиксирует UX-слой (§19): каждая точка,
 * где груз/рейс создаётся или редактируется в приложении, блокирует
 * очевидную невалидную цену ДО сетевого вызова, и делает это
 * локализованным сообщением.
 *
 * Run: node tests/frontend/test_cargo_price_validation_contract.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf-8');

let passed = 0;
let failed = 0;
function expect(cond, msg) {
  if (cond) { console.log(`  ✅ ${msg}`); passed++; }
  else { console.error(`  ❌ FAIL: ${msg}`); failed++; }
}

console.log('\n=== 1. Все точки ввода цены блокируют price <= 0 (значит и negative) ===');
{
  // [файл, регэксп страж-условия «цена не положительна»]
  const guards = [
    ['src/components/EditCargoModal.js', /pv\s*<=\s*0/],
    ['src/screens/CreateCargoScreen.js', /pNum\s*<=\s*0/],
    ['src/screens/CreateTripScreen.js', /pNum\s*<=\s*0/],
    ['src/screens/EditTripScreen.js', /priceNum\s*<=\s*0/],
  ];
  for (const [file, re] of guards) {
    const src = read(file);
    expect(re.test(src), `${path.basename(file)}: блокирует непозитивную цену (<= 0 → negative тоже отсечён)`);
    expect(
      /val_price_required/.test(src),
      `${path.basename(file)}: показывает локализованный val_price_required`
    );
  }
}

console.log('\n=== 2. Поле цены — числовая клавиатура (минус на пути ввода отсекается парсингом) ===');
{
  for (const file of [
    'src/components/EditCargoModal.js',
    'src/screens/CreateCargoScreen.js',
    'src/screens/CreateTripScreen.js',
  ]) {
    const src = read(file);
    expect(/keyboardType=["']numeric["']|keyboardType=\{['"]numeric['"]\}/.test(src),
      `${path.basename(file)}: keyboardType numeric`);
  }
}

console.log('\n=== 3. val_price_required локализован во всех 4 языках ===');
{
  const i18n = read('src/utils/i18n.js');
  const n = (i18n.match(/val_price_required:/g) || []).length;
  expect(n === 4, `val_price_required присутствует в 4 языках (найдено ${n})`);
  expect(/val_price_required: '请输入价格'/.test(i18n), 'ZH-значение переведено');
  expect(/val_price_required: 'Enter a price'/.test(i18n), 'EN-значение переведено');
}

console.log('\n=== 4. Backend остаётся финальным авторитетом (единый валидатор) ===');
{
  const mp = read('backend/api/marketplace.py');
  expect(/def _reject_negative_price/.test(mp), 'единый серверный валидатор _reject_negative_price существует');
  const validators = (mp.match(/@field_validator\("price"\)/g) || []).length;
  expect(validators === 4, `field_validator("price") подключён во всех 4 схемах (найдено ${validators})`);
  expect(/price_must_not_be_negative/.test(mp), 'валидатор бросает осмысленную причину');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
