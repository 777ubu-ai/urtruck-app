// Паритет ролей: грузоотправитель (28.08.2026, решения владельца).
//
// Найдено при сверке driver↔client: у клиента акцент был захардкожен как
// #FF8400 — контраст с белым текстом 2.46:1 (провал AA). У водителя кнопка
// «Принять» читалась, у клиента нет. themeContrastSmoke это не ловил: он
// проверяет токены палитры, а не хардкод-обходы (тот же класс ложно-зелёного,
// что уже был в CargoFeedScreen).
//
// Решения владельца: (1) оранжевый ОСТАЁТСЯ фирменным цветом клиента, но
// берётся из палитры и читаем; (2) верхний блок MyWork уезжает при скролле
// как в ленте/Сделках; (3) 4 вкладки у обеих ролей — код верный.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tokens = readFileSync('src/theme/designV1.js', 'utf8');
const myTrips = readFileSync('src/screens/MyTripsScreen.js', 'utf8');
const profile = readFileSync('src/screens/ProfileScreen.js', 'utf8');

// WCAG relative luminance / contrast — считаем прямо здесь, чтобы тест
// проверял ЧИСЛО, а не наличие строки.
const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = (hex) => {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const contrast = (a, b) => {
  const [la, lb] = [lum(a), lum(b)];
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
};

const tokenValue = (block, name) => {
  const seg = tokens.slice(tokens.indexOf(block));
  const m = seg.match(new RegExp(`${name}:\\s*'(#[0-9A-Fa-f]{6})'`));
  return m ? m[1] : null;
};

test('фирменный оранжевый клиента объявлен токеном в обеих темах', () => {
  assert.match(tokens, /clientBrand:/, 'нужен токен clientBrand');
  assert.match(tokens, /clientBrandFill:/, 'нужна декоративная подложка clientBrandFill');
  const light = tokenValue('const LIGHT = {', 'clientBrand');
  const dark = tokenValue('clientBrand:', 'clientBrand');
  assert.ok(light, 'clientBrand должен быть в LIGHT');
  assert.ok(dark, 'clientBrand должен быть в DARK');
});

test('LIGHT clientBrand читаем: >=4.5 с белым текстом (было 2.46 у #FF8400)', () => {
  const light = tokenValue('const LIGHT = {', 'clientBrand');
  const ratio = contrast(light, '#FFFFFF');
  assert.ok(ratio >= 4.5, `clientBrand ${light} даёт ${ratio.toFixed(2)}:1 с белым — нужно >=4.5 (AA)`);
  // Прежнее значение обязано остаться запрещённым в интерактиве.
  assert.ok(contrast('#FF8400', '#FFFFFF') < 4.5, 'sanity: #FF8400 действительно провальный');
});

test('DARK clientBrand читаем на тёмной поверхности', () => {
  const dark = tokenValue('clientBrand:', 'clientBrand');
  const surface = tokenValue('const DARK', 'surface') || '#151E19';
  const ratio = contrast(dark, surface);
  assert.ok(ratio >= 4.5, `DARK clientBrand ${dark} на ${surface} даёт ${ratio.toFixed(2)}:1`);
});

test('экраны берут акцент клиента из палитры, а не хардкодом', () => {
  for (const [name, src] of [['MyTripsScreen', myTrips], ['ProfileScreen', profile]]) {
    assert.match(src, /const accent = isDriver \? v1\.driver : v1\.clientBrand;/,
      `${name} должен брать акцент из палитры`);
    assert.doesNotMatch(src, /const accent = isDriver \? '#168759' : '#FF8400'/,
      `${name}: хардкод-акцент вернулся — клиентская кнопка снова нечитаема`);
  }
});

test('MyWork: верхний блок уезжает при скролле, как в ленте и Сделках', () => {
  // Заголовок + «Разместить» + «Архив» должны быть внутри ListHeaderComponent.
  assert.match(myTrips, /ListHeaderComponent=\{listHeader\}/);
  assert.match(myTrips, /const listHeader = \(/);
  // Срез именно от объявления listHeader до СЛЕДУЮЩЕГО за ним return —
  // indexOf('return (') поймал бы первый return внутренней функции выше.
  const hStart = myTrips.indexOf('const listHeader = (');
  const header = myTrips.slice(hStart, myTrips.indexOf('\n  return (', hStart));
  assert.match(header, /s\.titleBlock/, 'заголовок обязан уезжать');
  assert.match(header, /my-work-archive-toggle/, 'переключатель Архива обязан уезжать');
  assert.match(header, /mytrips-publish-route|mytrips-place-cargo/, 'кнопка размещения обязана уезжать');
  // Брендовая полоса с ☰ остаётся фиксированной — как topBar в ленте.
  const fixed = myTrips.slice(myTrips.indexOf('<SafeAreaView testID="my-work-screen"'), myTrips.indexOf('<FlatList'));
  assert.match(fixed, /mywork-menu-btn/, '☰ остаётся зафиксированным сверху');
});
