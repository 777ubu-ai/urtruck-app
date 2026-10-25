import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { buildExternalFreightShare, URTRUCK_ANDROID_STORE, URTRUCK_IOS_STORE } from '../../src/utils/externalFreightShare.js';
const require = createRequire(import.meta.url);
const code = require('@babel/core').transformSync(readFileSync('src/components/ShareModal.js', 'utf8'), {
  babelrc: false, configFile: false,
  plugins: [require('@babel/plugin-transform-react-jsx'), require('@babel/plugin-transform-modules-commonjs')],
}).code;
for (const platform of ['ios', 'android']) test(`${platform}: настоящий WhatsApp callback передаёт оба магазина без сайта и дублей`, () => {
  const opened = []; let closed = false;
  const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) };
  const native = { StyleSheet: { create: value => value }, Platform: { OS: platform }, Linking: { openURL: async url => { opened.push(url); } } };
  for (const name of ['View', 'Text', 'TouchableOpacity', 'Modal']) native[name] = name;
  const mocks = { react: React, 'react-native': native, 'expo-clipboard': {}, '@expo/vector-icons/FontAwesome5': 'Icon',
    '../utils/useI18n': { useI18n: () => ({ t: value => value }) },
    '../utils/ThemeContext': { useTheme: () => ({ theme: {} }) }, './Toast': { useToast: () => ({ toast() {} }) },
    '../config/env': { PUBLIC_WEB_ORIGIN: 'https://urtruck.kz' },
  };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => { assert.ok(name in mocks, name); return mocks[name]; } });
  const payload = buildExternalFreightShare({ kind: 'vehicle', status: 'active', origin: 'Buxoro', destination: 'Toshkent' }, { origin: 'https://urtruck.kz' });
  const tree = module.exports.default({ visible: true, shareText: payload.text, url: payload.url, onClose: () => { closed = true; } });
  const nodes = []; const walk = n => { if (Array.isArray(n)) return n.forEach(walk); if (n?.props) { nodes.push(n); walk(n.props.children); } }; walk(tree);
  nodes.find(n => n.type === 'TouchableOpacity' && n.props.children.some(c => c?.type === 'Text' && c.props.children.includes('WhatsApp'))).props.onPress();
  assert.equal(opened.length, 1);
  const link = new URL(opened[0]);
  assert.equal(link.hostname, 'wa.me');
  const text = link.searchParams.get('text');
  assert.ok(text.includes('Buxoro → Toshkent'));
  for (const store of [URTRUCK_ANDROID_STORE, URTRUCK_IOS_STORE]) assert.equal(text.split(store).length - 1, 1);
  assert.ok(!text.includes('https://urtruck.kz'));
  assert.equal(closed, true);
});
