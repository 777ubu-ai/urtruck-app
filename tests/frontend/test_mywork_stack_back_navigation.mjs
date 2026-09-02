// P0 2026-09-02 — §11 back navigation contract.
//
// Канон:
//   1. Root bottom-tab MyTrips НЕ рисует back-кнопку (только menu).
//   2. Stack-screens CreateCargo / CreateTrip рисуют back (BrandHeader onBack).
//   3. После успешного create → navigation.replace('MyTripsList') — не push,
//      чтобы пользователь не возвращался в форму создания.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mytrips = readFileSync('src/screens/MyTripsScreen.js', 'utf8');
const createCargo = readFileSync('src/screens/CreateCargoScreen.js', 'utf8');
const createTrip = readFileSync('src/screens/CreateTripScreen.js', 'utf8');

test('MyTripsScreen (root bottom-tab) НЕ рисует back — только menu button', () => {
  // Проверяем что brandBar не содержит back. Ищем pattern "onPress={() => navigation.goBack()}"
  // на кнопке в brandBar.
  const brandBarBlock = mytrips.match(/mywork-minimal-header[\s\S]{0,600}?<\/View>/);
  assert.ok(brandBarBlock, 'mywork-minimal-header блок должен существовать');
  assert.doesNotMatch(brandBarBlock[0], /navigation\.goBack/,
    'root bottom-tab MyTrips не должен иметь back');
  assert.match(brandBarBlock[0], /testID="mywork-menu-btn"/,
    'menu кнопка должна быть');
});

test('CreateCargoScreen рисует back через BrandHeader onBack → navigation.goBack', () => {
  assert.match(createCargo, /BrandHeader onBack=\{[\s\S]{0,100}?navigation\.goBack\(\)/,
    'BrandHeader onBack должен вызывать goBack');
});

test('CreateTripScreen рисует back через BrandHeader onBack → navigation.goBack', () => {
  assert.match(createTrip, /BrandHeader onBack=\{[\s\S]{0,100}?navigation\.goBack\(\)/,
    'BrandHeader onBack должен вызывать goBack');
});

test('CreateCargoScreen: после успешного создания → navigation.replace (не push)', () => {
  assert.match(createCargo, /navigation\.replace\(['"]MyTripsList['"]/,
    'replace не push — иначе back вернёт в форму создания');
});

test('CreateTripScreen: после успешного создания → navigation.replace (не push)', () => {
  assert.match(createTrip, /navigation\.replace\(['"]MyTripsList['"]/,
    'replace не push');
});
