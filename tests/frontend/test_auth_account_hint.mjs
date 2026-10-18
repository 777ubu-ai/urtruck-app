import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from '@babel/core';
import { readFileSync } from 'node:fs';
import translations from '../../src/utils/i18n.js';

const source = readFileSync('src/components/AuthAccountHint.js', 'utf8');
const { code } = transformSync(source, {
  babelrc: false, configFile: false,
  plugins: ['@babel/plugin-transform-react-jsx', '@babel/plugin-transform-modules-commonjs'],
});

function setup(lang) {
  const buttons = [];
  const calls = [];
  const module = { exports: {} };
  const require = (name) => {
    if (name === 'react') return React;
    if (name === 'react-native') return {
      View: 'div', Text: ({ testID, ...props }) => React.createElement('span', { ...props, 'data-testid': testID }),
      StyleSheet: { create: (s) => s },
      Pressable: ({ onPress, testID, children }) => {
        buttons.push(onPress);
        return React.createElement('button', { 'data-testid': testID }, children);
      },
    };
    if (name.endsWith('useI18n')) return { useI18n: () => ({ t: (key) => translations[lang][key] }) };
    if (name.endsWith('brandV2')) return { brandLight: {} };
    throw new Error(`Неожиданная зависимость: ${name}`);
  };
  new Function('require', 'module', 'exports', code)(require, module, module.exports);
  const render = (identifier, disabled = false) => renderToStaticMarkup(React.createElement(module.exports.default, {
    identifier, disabled, navigation: { reset: (x) => calls.push(x) },
  }));
  return { render, buttons, calls };
}

for (const lang of ['RU', 'KK', 'ZH', 'EN']) {
  test(`${lang}: различимые адреса и переход к входу без изменения учётной записи`, () => {
    const h = setup(lang);
    const oldAccount = h.render('driver888@example.com');
    const newAccount = h.render('driver@example.com');
    assert.ok(oldAccount.includes('driver888@example.com'));
    assert.ok(newAccount.includes('driver@example.com'));
    assert.ok(oldAccount.includes(translations[lang].auth_confirmed_email));
    assert.ok(oldAccount.includes(translations[lang].auth_existing_account));
    assert.ok(translations[lang].auth_account_load_failed);
    assert.doesNotMatch(oldAccount, /\*\*\*/);
    h.buttons[0]();
    assert.deepEqual(h.calls, [{ index: 0, routes: [{ name: 'PhoneV2' }] }]);
  });
}

test('телефонный вход не выдаётся за подтверждённую почту', () => {
  const h = setup('RU');
  assert.equal(h.render('+77015550000'), '');
  assert.deepEqual(h.buttons, []);
});

test('смена почты недоступна во время сохранения формы', () => {
  const h = setup('RU');
  h.render('driver@example.com', true);
  h.buttons[0]();
  assert.deepEqual(h.calls, []);
});
