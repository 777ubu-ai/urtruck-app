import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { localizeCargoName, localizePlace, localizeSystemMessage } from '../../src/utils/places.js';

const read = (p) => fs.readFileSync(p, 'utf8');
const i18n = read('src/utils/i18n.js');
const hook = read('src/utils/useI18n.js');
const cargoInput = read('src/components/CargoTypeInput.js');
const cargoTypes = read('src/utils/cargoTypes.js');
const normalizers = read('src/utils/normalizers.js');
const createCargo = read('src/screens/CreateCargoScreen.js');
const createTrip = read('src/screens/CreateTripScreen.js');
const workspace = read('src/screens/DealWorkspaceScreenV2.js');
const queue = read('src/screens/QueueScreenLazy.js');
const dealRoom = read('src/components/deal/DealRoom.js');
const timeline = read('src/components/deal/DealStatusTimeline.js');
const notifications = read('src/screens/NotificationsScreen.js');

const cyrillic = /[\u0400-\u052F]/u;
const stringLiterals = (src) => {
  const out = [];
  const re = /'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"/g;
  let m;
  while ((m = re.exec(src))) out.push((m[1] ?? m[2] ?? '').replace(/\\n/g, '\n'));
  return out;
};

test('known canonical cargo/place/system content localizes for ZH, EN and KK', () => {
  assert.equal(localizeCargoName('Обувь', 'ZH'), '鞋类');
  assert.equal(localizeCargoName('Обувь', 'EN'), 'Footwear');
  assert.equal(localizeCargoName('Обувь', 'KK'), 'Аяқ киім');
  assert.equal(localizePlace('Иу, 🇨🇳', 'ZH'), '义乌');
  assert.equal(localizePlace('Иу, 🇨🇳', 'EN'), 'Yiwu');
  assert.equal(localizePlace('Москва', 'KK'), 'Мәскеу');
  assert.equal(localizePlace('Бахты', 'ZH'), '巴克图');
  assert.equal(localizeSystemMessage('🚛 Рейс начался', 'ZH'), '🚛 运输已开始');
  assert.equal(localizeSystemMessage('✅ Получение груза подтверждено', 'EN'), '✅ Cargo receipt confirmed');
  assert.equal(localizeSystemMessage('🤝 Сделка завершена', 'KK'), '🤝 Мәміле аяқталды');
});

test('translation fallback can never jump from non-RU locale to RU', () => {
  assert.match(hook, /if \(lang !== 'RU'\) return translations\.EN/);
  assert.match(i18n, /return translations\.EN\[key\] \|\| key/);
  assert.doesNotMatch(i18n, /currentLang === 'RU' \|\| currentLang === 'KK'/);
});

test('generic cargo formatter uses canonical locale dictionary instead of raw Russian fallback', () => {
  assert.match(i18n, /import \{ localizeCargoName \} from '\.\/places'/);
  assert.match(i18n, /return localizeCargoName\(raw, currentLang\) \|\| raw/);
});

test('cargo suggestions render/search localized labels while preserving canonical value', () => {
  assert.match(cargoTypes, /searchCargoTypes = \(query, lang = 'RU'\)/);
  assert.match(cargoTypes, /localizeCargoName\(c\.name, lang\)/);
  assert.match(cargoInput, /searchCargoTypes\(query, lang\)/);
  assert.match(cargoInput, /localizeCargoName\(c\.name, lang\)/);
  assert.match(cargoInput, /onChange\(item\.name\)/);
});

test('shared marketplace display localizes routes, cargo names and legacy truck types', () => {
  assert.match(normalizers, /import \{ localizeCargoName, localizePlace \} from '\.\/places'/);
  assert.match(normalizers, /from: localizePlace\(sanitizeForDisplay\(cargo\?\.from\), lang\)/);
  assert.match(normalizers, /to: localizePlace\(sanitizeForDisplay\(trip\?\.to\), lang\)/);
  assert.match(normalizers, /LEGACY_TRUCK_TYPE_KEYS/);
  assert.match(normalizers, /localizedTypeLabel\(trip\.truckType, t, lang\)/);
  assert.match(normalizers, /localizeCargoName\(cargo\?\.cargoDesc, lang\)/);
});

test('create forms localize selected route point and persist clean canonical names', () => {
  for (const src of [createCargo, createTrip]) {
    assert.match(src, /displayRoutePoint/);
    assert.match(src, /localizePlace\(canonical, lang\)/);
    assert.match(src, /from_city: fromPoint\?\.name \|\| cleanPlaceName\(from\.trim\(\)\)/);
    assert.match(src, /to_city: toPoint\?\.name \|\| cleanPlaceName\(to\.trim\(\)\)/);
  }
});

test('deal workspace localizes dynamic cargo, body type, units and legacy system messages', () => {
  assert.match(workspace, /localizeSystemMessage\(message\.text \|\| '', lang\)/);
  assert.match(workspace, /localizeCargoName\(rawCargoName, lang\)/);
  assert.match(workspace, /formatTruckType\(rawTruckType\)/);
  assert.match(workspace, /if \(lang === 'ZH'\) return `\$\{amount\} 吨`/);
  assert.match(workspace, /\[roomId, session\?\.user\?\.id, lang\]/);
  assert.match(timeline, /localizePlace\(meta\.place, lang\)/);
});

test('border catalog and notifications localize server-owned legacy text', () => {
  assert.match(queue, /localizeCheckpointName\(cp\.name, lang\)/);
  assert.match(queue, /localizeCheckpointName\(live\.name \|\| selected\.name, lang\)/);
  assert.match(queue, /active \? L\.selected : L\.open/);
  assert.doesNotMatch(queue, /\? L\.selected : 'Нажать'/);
  assert.match(queue, /localizedQueueStatus\(lookup, L, lang\)/);
  assert.doesNotMatch(queue, /\{lookup\.status_raw \|\| lookup\.status\}/);
  assert.match(notifications, /localizeSystemMessage\(cleanNotifText\(item\.title\), lang\)/);
});

test('KK-only deal map copy does not fall through to Russian', () => {
  assert.match(dealRoom, /language\.startsWith\('kk'\)/);
  assert.match(dealRoom, /Жоспарланған бағыт/);
});

test('ZH and EN translation string literals contain no Cyrillic leakage', () => {
  const zhStart = i18n.indexOf('  ZH: {');
  const enStart = i18n.indexOf('  EN: {', zhStart);
  assert.ok(zhStart >= 0 && enStart > zhStart, 'ZH/EN blocks must be found');
  const end = i18n.indexOf('\n},\n};', enStart);
  assert.ok(end > enStart, 'EN block end must be found');
  const blocks = {
    ZH: i18n.slice(zhStart, enStart),
    EN: i18n.slice(enStart, end),
  };
  for (const [lang, block] of Object.entries(blocks)) {
    const bad = stringLiterals(block).filter((value) => cyrillic.test(value));
    assert.deepEqual(bad, [], `${lang} contains Cyrillic UI strings: ${bad.slice(0, 20).join(' | ')}`);
  }
});
