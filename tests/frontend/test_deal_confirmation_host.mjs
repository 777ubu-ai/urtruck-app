// Структурный renderer настоящего JSX с mocked native hosts; не device QA.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const babel = require('@babel/core');
const parser = require('@babel/parser');
const jsx = require('@babel/plugin-transform-react-jsx');
const cjs = require('@babel/plugin-transform-modules-commonjs');
const workspace = readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');
const component = readFileSync('src/components/ui/AppConfirmModal.js', 'utf8');
let visibleHosts = 0;
const host = tag => ({ children, testID, style }) => {
  const styles = Array.isArray(style) ? style.filter(Boolean) : [style];
  const paddingBottom = styles.reduce((value, item) => item?.paddingBottom ?? value, undefined);
  return React.createElement(tag, {
    'data-testid': testID,
    ...(paddingBottom == null ? {} : { 'data-padding-bottom': String(paddingBottom) }),
  }, children);
};
const native = {
  Modal: ({ visible, children }) => {
    if (!visible) return null;
    visibleHosts++;
    return React.createElement('section', { 'data-native-modal': true }, children);
  },
  View: host('div'), Text: host('span'), Pressable: host('div'),
  StyleSheet: { create: x => x },
};
function compile(source) {
  return babel.transformSync(source, { plugins: [jsx, cjs], configFile: false, babelrc: false }).code;
}
const module = { exports: {} };
new Function('require', 'module', 'exports', compile(component))(
  name => name === 'react' ? React : name === 'react-native' ? native
    : name.endsWith('designV1') ? { useV1Colors: () => ({}) } : require(name),
  module, module.exports);
const AppConfirmModal = module.exports.default;
const ast = parser.parse(workspace, { sourceType: 'module', plugins: ['jsx'] });
const fragments = [];
const contains = (node, identifier) => {
  if (!node || typeof node !== 'object') return false;
  if (node.type === 'Identifier' && node.name === identifier) return true;
  return Object.values(node).some(value => Array.isArray(value) ? value.some(x => contains(x, identifier)) : contains(value, identifier));
};
function walk(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'JSXElement') {
    const name = node.openingElement.name?.name;
    const statusHost = name === 'Modal' && node.openingElement.attributes.some(attr =>
      attr.name?.name === 'visible' && contains(attr.value, 'statusModalOpen'));
    if (statusHost || name === 'AppConfirmModal') {
      fragments.push(workspace.slice(node.start, node.end));
      return; // Встроенное подтверждение уже является частью host JSX.
    }
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') walk(value);
  }
}
walk(ast);
assert.ok(fragments.length >= 1);
function render({ status = true, confirmation = true, bottomInset = 34 } = {}) {
  visibleHosts = 0;
  const noop = () => {};
  const env = {
    React, Modal: native.Modal, AppConfirmModal, Pressable: native.Pressable,
    Text: native.Text, View: native.View, TouchableOpacity: host('button'),
    FlatList: () => null, Feather: () => null, Button: () => null,
    statusModalOpen: status,
    confirmDialog: confirmation ? { title: 'Доставлен?', confirmLabel: 'Да', message: 'Подтвердите доставку' } : null,
    setStatusModalOpen: noop, settleConfirm: noop, runNextAction: noop, cancelDeal: noop,
    closeStatusPanel: noop,
    s: {}, colors: {}, insets: { bottom: bottomInset }, window: { height: 844 }, ui: { statuses: 'Статусы', cancelDeal: 'Отменить' },
    timeline: [], statusLabel: 'В пути', nextAction: { key: 'delivered', label: 'Доставлен' },
    statusLoading: false, trackingLoading: false, nextActionTestId: 'deal-mark-delivered',
    deal: { status: 'at_border' }, t: key => key, isFocused: true,
  };
  const code = compile('const tree = <>' + fragments.join('\n') + '</>;');
  const tree = new Function(...Object.keys(env), code + '\nreturn tree;')(...Object.values(env));
  const markup = renderToStaticMarkup(tree);
  return { hosts: visibleHosts, markup };
}
test('статусы + подтверждение используют один native Modal host', () => {
  const result = render();
  assert.equal(result.hosts, 1);
  assert.match(result.markup, /Подтвердите доставку/);
  assert.match(result.markup, /deal-workspace-confirm-confirm/);
});
test('обычное открытие статусов сохраняет один host, закрытый экран — ноль', () => {
  assert.equal(render({ confirmation: false }).hosts, 1);
  assert.equal(render({ confirmation: false, status: false }).hosts, 0);
});
test('status panel учитывает нижний safe-area inset и сохраняет базовый отступ', () => {
  assert.match(render({ confirmation: false, bottomInset: 34 }).markup, /data-testid="deal-status-panel" data-padding-bottom="46"/);
  assert.match(render({ confirmation: false, bottomInset: 0 }).markup, /data-testid="deal-status-panel" data-padding-bottom="12"/);
});
test('подтверждение без открытого status panel всё ещё имеет host', () => {
  assert.equal(render({ status: false }).hosts, 1);
});
test('общий AppConfirmModal сохраняет default native host для остальных экранов', () => {
  visibleHosts = 0;
  const markup = renderToStaticMarkup(React.createElement(AppConfirmModal, {
    visible: true, title: 'Выйти', cancelLabel: 'Нет', confirmLabel: 'Да', testID: 'default-confirm',
  }));
  assert.equal(visibleHosts, 1);
  assert.match(markup, /default-confirm-confirm/);
  assert.match(markup, /default-confirm-cancel/);
});
