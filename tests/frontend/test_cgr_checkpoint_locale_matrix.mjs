// test_cgr_checkpoint_locale_matrix — PR #255 review requirement 2.
//
// "Add a test iterating every checkpoint fixture/catalog entry and prove:
//    ZH: no Cyrillic and uses Chinese names;
//    EN: no Cyrillic and uses English names;
//    KK: uses Kazakh canonical labels, not raw Russian fallback;
//    RU: canonical Russian remains correct."
//
// The catalogue is not a fixed list — CGR adds crossings — so this does not
// assert a hand-written expected table. It iterates every entry from the real
// CGR directory fixture AND the legacy BORDERS seed, and asserts the invariant
// that must hold for any input, including future entries.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { localizeCheckpointName, hasCyrillic, romanize } from '../../src/utils/checkpointNames.js';

// ---- catalogue sources -----------------------------------------------------

// 1. every entry in the real CGR directory fixture the backend parser is tested against
function fromDirectoryFixture() {
  const html = fs.readFileSync('backend/tests/cgr/fixtures/checkpoint_list.html', 'utf8');
  // the fixture lists crossings as anchor text "<KZ post> - <neighbour post>"
  const names = new Set();
  for (const m of html.matchAll(/>([^<>]{3,80}?\s-\s[^<>]{3,80}?)</g)) {
    const s = m[1].trim();
    if (hasCyrillic(s)) names.add(s);
  }
  return [...names];
}

// 2. every entry in the legacy hardcoded seed that /catalog falls back to
function fromLegacyBorders() {
  const py = fs.readFileSync('backend/services/border_service.py', 'utf8');
  const out = [];
  for (const m of py.matchAll(/\{"id":\s*"([a-z_]+)",\s*"name":\s*"([^"]+)"/g)) {
    out.push({ code: m[1], name: m[2] });
  }
  return out;
}

const fixtureNames = fromDirectoryFixture();
const legacy = fromLegacyBorders();

test('catalogue sources are non-empty (guards against a silently passing matrix)', () => {
  assert.ok(fixtureNames.length >= 10, `expected CGR fixture entries, got ${fixtureNames.length}`);
  assert.ok(legacy.length >= 15, `expected legacy BORDERS entries, got ${legacy.length}`);
});

const CJK = /[㐀-䶿一-鿿]/;
const LATIN = /[A-Za-z]/;
// Kazakh-specific letters; presence proves canonical Kazakh rather than raw Russian
const KAZAKH_ONLY = /[ӘәҒғҚқҢңӨөҰұҮүҺһІі]/;

function allEntries() {
  return [
    ...fixtureNames.map((name) => ({ name, code: '' })),
    ...legacy,
  ];
}

test('EN: every catalogue entry renders without Cyrillic', () => {
  const bad = [];
  for (const cp of allEntries()) {
    const en = localizeCheckpointName(cp, 'EN');
    if (hasCyrillic(en)) bad.push(`${cp.name} -> ${en}`);
    if (!LATIN.test(en)) bad.push(`${cp.name} -> ${en} (no Latin at all)`);
  }
  assert.deepEqual(bad, [], `EN checkpoint names must be Cyrillic-free Latin:\n${bad.join('\n')}`);
});

test('ZH: every catalogue entry renders without Cyrillic', () => {
  const bad = [];
  for (const cp of allEntries()) {
    const zh = localizeCheckpointName(cp, 'ZH');
    if (hasCyrillic(zh)) bad.push(`${cp.name} -> ${zh}`);
  }
  assert.deepEqual(bad, [], `ZH checkpoint names must contain no Cyrillic:\n${bad.join('\n')}`);
});

test('ZH: the major Xinjiang ports use real Chinese exonyms, not romanization', () => {
  // Where an established Chinese name exists it must be used. Everything else
  // legitimately romanizes (see the honesty note in checkpointNames.js).
  const expected = [
    ['Нур Жолы - Хоргос', '霍尔果斯'],
    ['Достык - Алашанькоу', '阿拉山口'],
    ['Бахты - Покиту', '巴克图'],
    ['Майкапчагай - Зимунай', '吉木乃'],
    ['Кольжат - Дулаты', '都拉塔'],
  ];
  for (const [ru, cn] of expected) {
    const zh = localizeCheckpointName({ name: ru, code: '' }, 'ZH');
    assert.ok(zh.includes(cn), `${ru} -> ${zh} should contain the real exonym ${cn}`);
    assert.ok(CJK.test(zh), `${ru} -> ${zh} should contain CJK`);
  }
});

test('KK: Kazakh-side posts use canonical Kazakh orthography, not raw Russian', () => {
  // Each pair is a Russian spelling and the Kazakh canonical form that must replace it.
  const pairs = [
    ['Достык - Алашанькоу', 'Достық'],
    ['Бахты - Покиту', 'Бақты'],
    ['Кордай', 'Қордай'],
    ['Кольжат', 'Қолжат'],
    ['Казыгурт', 'Қазығұрт'],
    ['Аксай - Илек', 'Ақсай'],
    ['Алимбет - Орск', 'Әлімбет'],
    ['Бидаик - Одесское', 'Бидайық'],
    ['Нур Жолы - Хоргос', 'Нұржолы'],
  ];
  const bad = [];
  for (const [ru, kkExpected] of pairs) {
    const kk = localizeCheckpointName({ name: ru, code: '' }, 'KK');
    if (!kk.includes(kkExpected)) bad.push(`${ru} -> ${kk} (expected to contain ${kkExpected})`);
    if (!KAZAKH_ONLY.test(kk)) bad.push(`${ru} -> ${kk} (no Kazakh-specific letter: raw Russian fallback?)`);
  }
  assert.deepEqual(bad, [], `KK must use canonical Kazakh labels:\n${bad.join('\n')}`);
});

test('RU: canonical Russian is preserved unchanged', () => {
  for (const cp of allEntries()) {
    const ru = localizeCheckpointName(cp, 'RU');
    assert.equal(ru, cp.name, `RU must pass through unchanged: ${cp.name} -> ${ru}`);
  }
});

test('completeness: an unseen future checkpoint still localizes without Cyrillic', () => {
  // The catalogue grows; the invariant must hold for names nobody mapped yet.
  const invented = [
    'Щучинск - Незнакомое',
    'Жаңаөзен - Придорожное',
    'Ұзынағаш - Совершенно-Новый-Пост',
  ];
  for (const name of invented) {
    for (const lang of ['EN', 'ZH']) {
      const out = localizeCheckpointName({ name, code: '' }, lang);
      assert.ok(!hasCyrillic(out), `${lang}: unseen "${name}" leaked Cyrillic -> ${out}`);
      assert.ok(out.length > 0, `${lang}: unseen "${name}" produced empty output`);
    }
  }
});

test('server-provided locale field wins, but a Cyrillic "translation" is rejected for EN/ZH', () => {
  const row = { code: 'x', name: 'Байтанат - Топольное', name_en: 'Baytanat - Topolnoye', name_zh: '拜塔纳特' };
  assert.equal(localizeCheckpointName(row, 'EN'), 'Baytanat - Topolnoye');
  assert.equal(localizeCheckpointName(row, 'ZH'), '拜塔纳特');
  // a server that mistakenly echoes Russian into name_en must not be trusted
  const badRow = { code: 'y', name: 'Бидаик - Одесское', name_en: 'Бидаик - Одесское' };
  const en = localizeCheckpointName(badRow, 'EN');
  assert.ok(!hasCyrillic(en), `must not trust a Cyrillic name_en, got ${en}`);
});

test('the live Border screen actually uses the canonical localizer and has no bare Russian label', () => {
  const live = fs.readFileSync('src/screens/QueueScreenLazyV2.js', 'utf8');
  assert.match(live, /import \{ localizeCheckpointName \}/, 'live screen must import the localizer');
  assert.doesNotMatch(live, /\{active \? L\.selected : 'Нажать'\}/, 'the hardcoded Russian tap label must be gone');
  // tapToOpen must exist in all four COPY blocks
  const count = [...live.matchAll(/tapToOpen:/g)].length;
  assert.equal(count, 4, `tapToOpen must be defined in RU/KK/EN/ZH (found ${count})`);
  // checkpoint names must never be rendered raw again
  assert.doesNotMatch(live, /numberOfLines=\{1\}>\{checkpoint\.name\}</, 'raw checkpoint.name render must be gone');
});

test('romanize is deterministic and covers Kazakh-specific letters', () => {
  assert.equal(romanize('Байтанат'), 'Baytanat');
  assert.equal(romanize('Топольное'), 'Topolnoye');
  assert.equal(romanize('Әлімбет'), 'Alimbet');
  assert.equal(romanize('Қазығұрт'), 'Kazygurt');
  assert.equal(romanize('Байтанат'), romanize('Байтанат'));
});
