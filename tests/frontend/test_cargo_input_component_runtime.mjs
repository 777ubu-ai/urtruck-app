import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import sucrase from 'sucrase';
import { cargoInputText, localizeCargoName } from '../../src/utils/places.js';

// Исполняем настоящий компонент: ввод, родительский rerender, язык и явный выбор.
function harness() {
  const slots = []; let cursor = 0, value = '', lang = 'RU', notify;
  const changes = [];
  const hooks = { ...React,
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial;
      return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useEffect(effect) { const i = cursor++; if (!(i in slots)) slots[i] = effect(); },
  };
  const require = name => {
    if (name === 'react') return hooks;
    if (name === 'react-native') return { View: 'View', Text: 'Text', TextInput: 'TextInput', TouchableOpacity: 'TouchableOpacity', ScrollView: 'ScrollView', StyleSheet: { create: x => x } };
    if (name.endsWith('/ThemeContext')) return { useTheme: () => ({ theme: {} }) };
    if (name.endsWith('/useI18n')) return { useI18n: () => ({ lang, t: x => x }) };
    if (name.endsWith('/places')) return { cargoInputText, localizeCargoName };
    if (name.endsWith('/cargoTypes')) return { searchCargoTypes: () => [{ name: 'Обувь' }], addCustomCargoType: () => {}, subscribeToCargoTypes: cb => { notify = cb; return () => {}; } };
    throw Error(name);
  };
  const exports = {};
  vm.runInNewContext(sucrase.transform(fs.readFileSync('src/components/CargoTypeInput.js', 'utf8'), { transforms: ['imports', 'jsx'] }).code, { exports, require, setTimeout });
  const elements = node => !node?.props ? [] : [node, ...React.Children.toArray(node.props.children).flatMap(elements)];
  const render = () => { cursor = 0; return elements(exports.default({ value, onChange: next => { changes.push(next); value = next; } })); };
  const input = () => render().find(x => x.type === 'TextInput');
  return { input, render, changes, type: text => input().props.onChangeText(text), language: next => { lang = next; }, notify: () => notify(), restore: text => { value = text; } };
}

test('посимвольный ввод, вставка и середина не заменяются при rerender, уведомлении справочника и смене языка', () => {
  const h = harness();
  for (const text of ['Оборудование ', 'Оборудование в деревянных ящиках ', 'Оборудование\n设备 箱装  ', 'Оборудование в новых ящиках']) {
    h.type(text); h.notify(); h.language('ZH');
    assert.equal(h.input().props.value, text);
    h.language('EN'); assert.equal(h.input().props.value, text);
    assert.equal(h.changes.at(-1), text);
  }
});

test('справочная подпись применяется только нажатием, сохраняет canonical и не повторяется после начала правки', () => {
  const h = harness(); h.language('ZH'); h.input().props.onFocus();
  h.render().find(x => x.type === 'TouchableOpacity').props.onPress();
  assert.equal(h.changes.at(-1), 'Обувь'); assert.equal(h.input().props.value, '鞋类');
  h.language('RU'); assert.equal(h.input().props.value, '鞋类');
  h.type('鞋类 в ящиках '); h.notify(); h.language('EN');
  assert.equal(h.input().props.value, '鞋类 в ящиках ');
  h.restore('Из черновика\n设备 '); assert.equal(h.input().props.value, 'Из черновика\n设备 ');
  h.type('Из черновика\n设备 новый ввод '); h.notify();
  assert.equal(h.input().props.value, 'Из черновика\n设备 новый ввод ');
});
