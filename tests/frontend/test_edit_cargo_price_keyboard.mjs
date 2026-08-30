// Регрессия P0-hotfix TestFlight 1.0.7 build18 (28.08.2026), §3.
//
// Баг: экран «Изменить цену» (EditCargoModal — открывается из MyTripsScreen
// на карточке своего груза клиента) перекрывался клавиатурой на iOS. Форма
// длинная (7 полей: цена, описание, дата подачи, вес, объём, тип кузова,
// оплата), кнопка «Сохранить» — в самом низу ScrollView внутри sheet со
// статичным maxHeight:'88%' и БЕЗ учёта safe-area/высоты клавиатуры.
//
// Фикс: useSafeAreaInsets + явный keyboardVerticalOffset={0} на
// KeyboardAvoidingView (sheet раскрыт в transparent fullscreen Modal без
// своего header/nav-bar — компенсировать больше нечего) +
// contentInsetAdjustmentBehavior="automatic" + щедрый нижний padding
// ScrollView с учётом insets.bottom — гарантия, что «Сохранить» дотягивается
// скроллом, даже если KeyboardAvoidingView внутри transparent Modal на iOS
// ошибётся с измерением клавиатуры (задокументированная особенность RN).
//
// Run: node --experimental-loader ./tests/frontend/loader.mjs --test \
//        tests/frontend/test_edit_cargo_price_keyboard.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync('src/components/EditCargoModal.js', 'utf8');

test('EditCargoModal: импортирует useSafeAreaInsets и вызывает его в компоненте', () => {
  assert.match(src, /import\s*\{\s*useSafeAreaInsets\s*\}\s*from\s*'react-native-safe-area-context'/,
    'без импорта нечем считать safe-area отступ снизу');
  assert.match(src, /const\s+insets\s*=\s*useSafeAreaInsets\(\)/,
    'insets должны браться внутри компонента, до использования в contentContainerStyle');
});

test('EditCargoModal: KeyboardAvoidingView получает явный keyboardVerticalOffset', () => {
  const kavIdx = src.indexOf('<KeyboardAvoidingView');
  assert.ok(kavIdx > 0, 'KeyboardAvoidingView должен присутствовать (был и раньше)');
  const kavBlock = src.slice(kavIdx, kavIdx + 400);
  assert.match(kavBlock, /behavior=\{Platform\.OS === 'ios' \? 'padding' : undefined\}/,
    'padding-режим на iOS не убран');
  assert.match(kavBlock, /keyboardVerticalOffset=\{0\}/,
    'без явного offset регрессия возвращается — RN может неверно измерить высоту клавиатуры в transparent Modal');
});

test('EditCargoModal: ScrollView учитывает safe-area в нижнем padding и настроен под клавиатуру', () => {
  const scrollIdx = src.indexOf('<ScrollView');
  assert.ok(scrollIdx > 0, 'ScrollView с полями формы должен присутствовать');
  const scrollBlock = src.slice(scrollIdx, scrollIdx + 900);
  assert.match(scrollBlock, /keyboardShouldPersistTaps="handled"/,
    'тап по кнопке Сохранить не должен сначала закрывать клавиатуру вхолостую');
  assert.match(scrollBlock, /contentInsetAdjustmentBehavior="automatic"/,
    'iOS должен сам корректировать contentInset под safe-area');
  assert.match(scrollBlock, /contentContainerStyle=\{\{\s*paddingBottom:\s*Math\.max\(insets\.bottom,\s*16\)\s*\+\s*48\s*\}\}/,
    'нижний padding обязан учитывать insets.bottom, а не быть статичным числом');
});

test('EditCargoModal: старый безопасный fallback (без keyboardVerticalOffset) не возвращается', () => {
  assert.doesNotMatch(
    src,
    /<KeyboardAvoidingView style=\{\{ flex: 1 \}\} behavior=\{Platform\.OS === 'ios' \? 'padding' : undefined\}>\s*\n\s*<Pressable/,
    'старая проводка KeyboardAvoidingView без offset/insets не должна вернуться регрессией'
  );
});
