import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import sucrase from 'sucrase';

// Выполняем настоящий Field: перенос даты включается только его вызывающим экраном.
function renderField(props) {
  const colors = new Proxy({}, { get: () => '#14221C' });
  const exports = {};
  const require = name => {
    if (name === 'react') return { ...React, useState: value => [value, () => {}] };
    if (name === 'react-native') return { View: 'View', Text: 'Text', TextInput: 'TextInput', TouchableOpacity: 'TouchableOpacity', StyleSheet: { create: x => x } };
    if (name === '@expo/vector-icons/Feather') return { __esModule: true, default: 'Feather' };
    if (name.endsWith('/designV1')) return { useV1Colors: () => colors, useShipperCeramicColors: () => colors, v1Radius: { field: 14 }, v1Spacing: { sm: 8 }, v1Typography: { label: {} } };
    if (name.endsWith('/KeyboardSafeLayout')) return { useKeyboardSafeFocus: x => x };
    throw Error(name);
  };
  vm.runInNewContext(sucrase.transform(fs.readFileSync('src/components/ui/v1/Field.js', 'utf8'), { transforms: ['jsx', 'imports'] }).code, { exports, require });
  const nodes = [];
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node?.props) return;
    if (typeof node.type === 'function') return visit(node.type(node.props));
    nodes.push(node);
    visit(node.props.children);
  }
  visit(exports.default(props));
  return nodes;
}

test('полная дата может переноситься без усечения и сохраняет обработчик календаря', () => {
  let opened = 0;
  const value = '25.10.2026';
  const nodes = renderField({ variant: 'dropdown', label: 'Дата выезда', value, valueNumberOfLines: 0, onPress: () => opened++ });
  const text = nodes.find(n => n.type === 'Text' && n.props.children === value);
  assert.equal(text.props.numberOfLines, 0);
  nodes.find(n => n.type === 'TouchableOpacity').props.onPress();
  assert.equal(opened, 1);
  assert.equal(text.props.children, value);
});

test('остальные dropdown-поля сохраняют прежнее ограничение одной строкой', () => {
  const nodes = renderField({ variant: 'dropdown', value: 'Тент' });
  assert.equal(nodes.find(n => n.type === 'Text' && n.props.children === 'Тент').props.numberOfLines, 1);
});

test('числовой ввод не меняется при добавлении опции переноса dropdown', () => {
  let changed;
  const nodes = renderField({ value: '150', keyboardType: 'decimal-pad', onChangeText: x => { changed = x; }, valueNumberOfLines: 0 });
  const input = nodes.find(n => n.type === 'TextInput');
  assert.equal(input.props.value, '150');
  assert.equal(input.props.keyboardType, 'decimal-pad');
  input.props.onChangeText('160');
  assert.equal(changed, '160');
});
