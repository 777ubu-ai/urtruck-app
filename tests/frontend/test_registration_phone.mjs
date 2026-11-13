import test from 'node:test';
import assert from 'node:assert/strict';
import { registrationCountry, registrationNumber, registrationNational, validRegistrationPhone } from '../../src/utils/registrationPhone.js';

for (const [iso, local, full] of [['KZ', '7051234567', '+77051234567'], ['CN', '13800138000', '+8613800138000'], ['UZ', '901234567', '+998901234567']]) {
  test(iso + ': национальный ввод и полный номер сохраняют цифры', () => {
    const country = registrationCountry(full);
    assert.equal(country.iso, iso);
    assert.equal(registrationNumber(local, country), full);
    assert.equal(registrationNumber(full, country), full);
    assert.equal(registrationNational(full, country), local);
    assert.equal(validRegistrationPhone(full, country), true);
    assert.equal(validRegistrationPhone(full.slice(0, -1), country), false);
  });
}
test('пустой и слишком длинный номер не принимаются', () => {
  const country = registrationCountry('');
  for (const value of ['', '+7', '+7123', '+770512345678', 'guest_1234567890', 'qa@example.test']) {
    assert.equal(validRegistrationPhone(value, country), false);
  }
});
test('вставка +86 переключает страну; +7 не добавляется вторично', () => {
  assert.equal(registrationCountry('+86 138 0013 8000').iso, 'CN');
  assert.equal(registrationNumber('8 (705) 123-45-67', registrationCountry('')), '+77051234567');
  assert.equal(registrationNumber('７０５１２３４５６７', registrationCountry('')), '+77051234567');
});
