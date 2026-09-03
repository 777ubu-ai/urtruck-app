// P0 2026-09-03 — §11/§14 back navigation contract (owner-verified update).
//
// Root cause физически доказан на Android 15 (4PYDDI4DHIXS5DD6) и
// Android 16 (BUA6JB99T465Q49X): navigation.replace('MyTripsList', ...)
// после публикации открывал ОТДЕЛЬНЫЙ Stack.Screen 'MyTripsList' (в
// AppNavigator.js смонтирован ВНЕ Tab.Navigator MainTabs) — экран без
// BottomNav. Пользователь физически упирался в тупик: ни таббара, ни
// стрелки назад на этом кадре.
//
// Канон (обновлён владельцем 2026-09-03, физически перепроверено):
//   1. MyWork (bottom-tab, route.name === 'MyWork') НЕ рисует back —
//      только menu button. BottomNav (Tab.Navigator) виден всегда.
//   2. MyTripsList (прямой stack-вход/deep link, route.name ===
//      'MyTripsList') рисует явную back-стрелку (mywork-back-btn),
//      т.к. это отдельный Stack.Screen без BottomNav — без неё Back
//      был бы физическим тупиком.
//   3. Stack-screens CreateCargo/CreateTrip рисуют back (BrandHeader
//      onBack) — не менялось.
//   4. После успешной публикации — navigation.popToTop(), НЕ
//      navigation.replace('MyTripsList', ...) и НЕ navigate('Main',
//      {screen:'MyWork'}) (последнее физически подтверждено создающим
//      лишний, не полностью смонтированный Main — см. комментарии в
//      CreateCargoScreen.js/CreateTripScreen.js). popToTop() возвращает
//      к уже смонтированному Main→MyWork без дублей в стеке; таббар
//      остаётся виден, экран обновляет список через уже существующий
//      navigation.addListener('focus', ...) в MyTripsScreen.js.
//
// Физическое доказательство (screenshots): ~/urtruck-qa-evidence/android16/
// task1f_AFTER.png (BottomNav виден сразу после публикации рейса),
// task1f_truck.png..task1f_check.png (полный сценарий заполнения формы).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mytrips = readFileSync('src/screens/MyTripsScreen.js', 'utf8');
const createCargo = readFileSync('src/screens/CreateCargoScreen.js', 'utf8');
const createTrip = readFileSync('src/screens/CreateTripScreen.js', 'utf8');
const appNavigator = readFileSync('src/navigation/AppNavigator.js', 'utf8');

test('AppNavigator: MyTripsList остаётся отдельным Stack.Screen вне MainTabs (контракт не менялся)', () => {
  assert.match(appNavigator, /<Stack\.Screen name="MyTripsList" component=\{MyTripsScreen\}/,
    'MyTripsList должен существовать как standalone route для deep link/legacy входа');
  assert.match(appNavigator, /<Tab\.Screen name="MyWork" component=\{MyTripsScreen\}/,
    'MyWork должен существовать как tab route внутри MainTabs');
});

test('MyTripsScreen: на MyWork (tab) — НЕ рисует back, только menu button', () => {
  assert.match(mytrips, /const isStackScreen = route\?\.name === ['"]MyTripsList['"]/,
    'должна быть явная проверка route.name === MyTripsList для показа back');
  assert.match(mytrips, /testID="mywork-minimal-header"/, 'mywork-minimal-header должен существовать');
  const menuBtnBlock = mytrips.match(/testID="mywork-menu-btn"[\s\S]{0,200}/);
  assert.ok(menuBtnBlock, 'mywork-menu-btn блок должен существовать');
  const menuBtnOnPress = mytrips.match(/onPress=\{\(\) => navigation\.navigate\(['"]Profile['"][\s\S]{0,150}?testID="mywork-menu-btn"/);
  assert.ok(menuBtnOnPress, 'mywork-menu-btn должен вести в Profile, а не goBack');
});

test('MyTripsScreen: на MyTripsList (прямой stack-вход) — рисует явную back-стрелку', () => {
  assert.match(mytrips, /testID="mywork-back-btn"/,
    'back-кнопка должна существовать для standalone MyTripsList входа (без неё — тупик)');
  assert.match(mytrips, /showBackButton[\s\S]{0,60}?navigation\.goBack\(\)/,
    'back-кнопка должна вызывать navigation.goBack()');
});

test('CreateCargoScreen рисует back через BrandHeader onBack → navigation.goBack', () => {
  assert.match(createCargo, /BrandHeader onBack=\{[\s\S]{0,100}?navigation\.goBack\(\)/,
    'BrandHeader onBack должен вызывать goBack');
});

test('CreateTripScreen рисует back через BrandHeader onBack → navigation.goBack', () => {
  assert.match(createTrip, /BrandHeader onBack=\{[\s\S]{0,100}?navigation\.goBack\(\)/,
    'BrandHeader onBack должен вызывать goBack');
});

test('CreateCargoScreen: после публикации → navigation.popToTop() (live-код, не в комментарии)', () => {
  // Ищем реальный вызов вне комментариев: строка не должна начинаться с '//'.
  const liveCallLines = createCargo.split('\n').filter((l) => /navigation\.(replace|navigate)\(['"]/.test(l) && !l.trim().startsWith('//'));
  assert.ok(liveCallLines.every((l) => !/MyTripsList/.test(l)),
    `replace/navigate(MyTripsList) физически подтверждён dead-end'ом (нет BottomNav) — найден live-вызов: ${liveCallLines.join(' | ')}`);
  assert.match(createCargo, /navigation\.popToTop\(\)/,
    'popToTop физически подтверждён единственным вариантом без dead-end/дублей Main');
});

test('CreateTripScreen: после публикации → navigation.popToTop() (live-код, не в комментарии)', () => {
  const liveCallLines = createTrip.split('\n').filter((l) => /navigation\.(replace|navigate)\(['"]/.test(l) && !l.trim().startsWith('//'));
  assert.ok(liveCallLines.every((l) => !/MyTripsList/.test(l)),
    `replace/navigate(MyTripsList) физически подтверждён dead-end'ом (нет BottomNav) — найден live-вызов: ${liveCallLines.join(' | ')}`);
  assert.match(createTrip, /navigation\.popToTop\(\)/,
    'popToTop физически подтверждён единственным вариантом без dead-end/дублей Main');
});
