import * as localeHelpers from '../../src/utils/additionalLocales.js';
import test from 'node:test';
import assert from 'node:assert/strict';
// Проверяем реальный resolver с явно заданным публичным release origin.
const previousPublicOrigin = process.env.EXPO_PUBLIC_WEB_URL;
process.env.EXPO_PUBLIC_WEB_URL = 'https://urtruck.kz';
const env = await import('../../src/config/env.js?ios110-release-contract');
if (previousPublicOrigin === undefined) delete process.env.EXPO_PUBLIC_WEB_URL;
else process.env.EXPO_PUBLIC_WEB_URL = previousPublicOrigin;
import { buildCarrierContactShare, buildExternalFreightShare, URTRUCK_ANDROID_STORE, URTRUCK_IOS_STORE } from '../../src/utils/externalFreightShare.js';

for (const lang of ['RU', 'KK', 'ZH', 'EN']) test(`${lang}: отправка грузов, машин и перевозчиков ведёт в оба магазина`, () => {
  for (const origin of ['https://urtruck.kz', 'https://qa2.urtruck.kz']) {
    for (const kind of ['cargo', 'vehicle', 'carrier_contact']) {
      const build = kind === 'carrier_contact' ? buildCarrierContactShare : buildExternalFreightShare;
      const result = build({ kind, status: 'active', origin: 'Buxoro', destination: 'Toshkent' }, { origin, lang });
      assert.equal(result.url, URTRUCK_IOS_STORE);
      if (kind !== 'carrier_contact') assert.equal(result.copyLinkText, `${URTRUCK_ANDROID_STORE}\n${URTRUCK_IOS_STORE}`);
      assert.match(result.text, /Android: https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.urtruck\.app/);
      assert.ok(result.text.endsWith(`iPhone: ${URTRUCK_IOS_STORE}`));
      assert.equal(result.text.split(URTRUCK_ANDROID_STORE).length - 1, 1);
      assert.equal(result.text.split(URTRUCK_IOS_STORE).length - 1, 1);
      assert.ok(!result.text.includes('https://urtruck.kz'));
      assert.ok(!result.text.includes('https://qa2.urtruck.kz'));
    }
  }
});

test('реальная конфигурация даёт видимую кнопку отправки для минимального активного объявления', () => {
  for (const kind of ['cargo', 'vehicle']) {
    const result = buildExternalFreightShare({ id: 'synthetic', kind, status: 'active' }, { origin: env.PUBLIC_WEB_ORIGIN });
    assert.ok(result, `active ${kind} must have a share payload with the real env export`);
    assert.equal(result.url, 'https://apps.apple.com/kz/app/urtruck/id6764504167');
  }
});

test('непубличный API preview не превращается в публичную ссылку', async () => {
  const previous = process.env.EXPO_PUBLIC_API_URL;
  try {
    process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8002';
    const qaEnv = await import('../../src/config/env.js?share-qa-test');
    assert.equal(qaEnv.PUBLIC_WEB_ORIGIN, '');
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = previous;
  }
});
test('перевозчик: whitelist полей без телефона, ИНН, цены и выдуманной даты', () => {
  const item = { kind: 'carrier_contact', status: 'active', name: 'Компания', city: 'Алматы', country: 'KZ', transport_type: 'Тент',
    phones: ['+77000000001'], inn: 'PRIVATE-INN', original_text: 'PRIVATE-TEXT', amount: 6600, source_published_at: 'PRIVATE-DATE' };
  for (const lang of ['RU', 'KK', 'ZH', 'EN']) {
    const result = buildCarrierContactShare(item, { origin: env.PUBLIC_WEB_ORIGIN, lang });
    assert.ok(result); assert.ok(result.text.includes('Компания'));
    for (const value of ['+77000000001', 'PRIVATE-INN', 'PRIVATE-TEXT', '6600', 'PRIVATE-DATE']) assert.ok(!result.text.includes(value));
  }
  assert.equal(buildCarrierContactShare({ ...item, status: 'hidden' }, { origin: env.PUBLIC_WEB_ORIGIN }), null);
  assert.equal(buildCarrierContactShare(item, { origin: 'https://evil.test' }), null);
  assert.equal(buildExternalFreightShare(item, { origin: env.PUBLIC_WEB_ORIGIN }), null);
});
test('закрытые и истёкшие объявления не становятся активными ради отправки', () => {
  for (const status of ['closed', 'hidden', 'expired', 'unavailable']) assert.equal(buildExternalFreightShare({ kind: 'cargo', status }, { origin: env.PUBLIC_WEB_ORIGIN }), null);
  assert.equal(buildExternalFreightShare({ kind: 'cargo', status: 'active', expires_at: '2020-01-01' }, { origin: env.PUBLIC_WEB_ORIGIN }), null);
});

for (const lang of ['RU', 'KK', 'ZH', 'EN']) test(`${lang}: карточка перевозчика только копирует телефоны и сохраняет Share`, async () => {
  const { readFileSync } = await import('node:fs');
  const { createRequire } = await import('node:module');
  const { default: vm } = await import('node:vm');
  const require = createRequire(import.meta.url);
  const babel = require('@babel/core');
  const code = babel.transformSync(readFileSync('src/components/externalFreight/CarrierDirectory.js', 'utf8'), {
    babelrc: false, configFile: false, plugins: [require('@babel/plugin-transform-react-jsx'), require('@babel/plugin-transform-modules-commonjs')],
  }).code;
  const opened = [], copied = []; let shared = 0;
  const native = { Linking: { openURL: async url => { opened.push(url); } }, StyleSheet: { create: x => x } };
  for (const name of ['Text', 'TouchableOpacity', 'View']) native[name] = name;
  const mocks = {
    '../utils/additionalLocales.js': localeHelpers, '../../utils/additionalLocales.js': localeHelpers,
    react: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), useMemo: fn => fn() },
    'react-native': native, '@expo/vector-icons/Feather': 'Feather', 'expo-clipboard': { setStringAsync: async value => { copied.push(value); } },
    '../../utils/useI18n': { useI18n: () => ({ lang, sp: n => n }) },
    '../../utils/ThemeContext': { useTheme: () => ({ theme: {} }) },
    '../../components/Toast': { useToast: () => ({ toast() {} }) },
  };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => { assert.ok(name in mocks, name); return mocks[name]; } });
  const tree = module.exports.default({ item: { id: 'synthetic-carrier', name: 'Компания', sources: [], phones: ['+7 (700) 000-00-01', '998500014250'] }, shareLabel: 'Поделиться', onShare: () => { shared++; } });
  const nodes = [];
  const walk = n => { if (Array.isArray(n)) return n.forEach(walk); if (n?.props) { nodes.push(n); walk(n.props.children); } }; walk(tree);
  nodes.find(n => n.props.testID === 'carrier-directory-share-synthetic-carrier').props.onPress();
  const copyLabel = module.exports.CARRIER_COPY[lang].copy;
  for (const phone of ['+7 (700) 000-00-01', '998500014250']) {
    await nodes.find(n => n.props.accessibilityLabel === `${copyLabel} ${phone}`).props.onPress();
  }
  for (const button of nodes.filter(n => n.props.accessibilityLabel === copyLabel)) await button.props.onPress();
  assert.equal(shared, 1);
  assert.deepEqual(opened, [], 'нажатие номера/копирования не открывает звонилку');
  assert.deepEqual(copied, ['+7 (700) 000-00-01', '998500014250', '+7 (700) 000-00-01', '998500014250']);
  assert.ok(!nodes.some(n => n.type === 'Feather' && n.props.name === 'phone'));
});
