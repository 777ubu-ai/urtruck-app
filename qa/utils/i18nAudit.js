#!/usr/bin/env node
// i18n-аудит: сверяет ключи, вызванные через t('...'), с языками в i18n.js
// (RU/KK/ZH/EN), и кросс-языковую полноту относительно RU (база fallback).
//
// t() резолв: currentLang[key] || translations.RU[key] || key.
//   → ключ, вызванный в коде, но отсутствующий в RU = СЫРОЙ КЛЮЧ в UI (баг).
//   → ключ есть в RU, но нет в KK/ZH/EN = fallback на RU (непереведено, мягко).
//
// Запуск: node qa/utils/i18nAudit.js
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const ROOT = path.resolve(__dirname, '..', '..');
const I18N = path.join(ROOT, 'src', 'utils', 'i18n.js');

// ── 1. Извлечь наборы ключей по языкам из объекта translations ──
const ast = babel.parseSync(fs.readFileSync(I18N, 'utf8'), {
  filename: I18N, presets: ['babel-preset-expo'],
});
const langKeys = {};
function collectFromObject(objExpr) {
  const set = new Set();
  for (const prop of objExpr.properties) {
    if (prop.type !== 'ObjectProperty') continue;
    const k = prop.key.name || prop.key.value;
    if (k != null) set.add(String(k));
  }
  return set;
}
babel.traverse(ast, {
  VariableDeclarator(p) {
    if (p.node.id.name !== 'translations') return;
    for (const prop of p.node.init.properties) {
      const lang = prop.key.name || prop.key.value;
      if (['RU', 'KK', 'ZH', 'EN'].includes(lang) && prop.value.type === 'ObjectExpression') {
        langKeys[lang] = collectFromObject(prop.value);
      }
    }
  },
});

// ── 2. Собрать все статические t('key') по src/ ──
function walk(dir, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) { if (!/node_modules/.test(fp)) walk(fp, acc); }
    else if (/\.(js|jsx)$/.test(e.name)) acc.push(fp);
  }
  return acc;
}
const files = walk(path.join(ROOT, 'src'), []);
const usedKeys = new Map(); // key -> Set(file:line)
const RE = /\bt\(\s*['"]([a-zA-Z0-9_]+)['"]\s*\)/g;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    let m;
    RE.lastIndex = 0;
    while ((m = RE.exec(line))) {
      const k = m[1];
      if (!usedKeys.has(k)) usedKeys.set(k, new Set());
      usedKeys.get(k).add(`${path.relative(ROOT, f)}:${i + 1}`);
    }
  });
}

// ── 3. Отчёт ──
const RU = langKeys.RU || new Set();
const rawInUi = []; // t()-ключ отсутствует в RU → сырой ключ
for (const [k, locs] of usedKeys) {
  if (!RU.has(k)) rawInUi.push({ k, locs: [...locs] });
}
const missing = { KK: [], ZH: [], EN: [] };
for (const k of RU) {
  for (const L of ['KK', 'ZH', 'EN']) {
    if (!langKeys[L]?.has(k)) missing[L].push(k);
  }
}

console.log('=== i18n AUDIT ===');
console.log('Языки/ключей:', Object.fromEntries(Object.entries(langKeys).map(([l, s]) => [l, s.size])));
console.log('Уникальных t(\'...\') статических ключей в src:', usedKeys.size);
console.log('');
console.log('### P1/P2 — t()-ключи ОТСУТСТВУЮТ в RU (СЫРОЙ КЛЮЧ в UI):', rawInUi.length);
for (const { k, locs } of rawInUi) console.log(`  ${k}  ←  ${locs.slice(0, 4).join(', ')}`);
console.log('');
console.log('### P3 — есть в RU, нет в др. языке (fallback на RU, непереведено):');
for (const L of ['KK', 'ZH', 'EN']) {
  console.log(`  ${L}: ${missing[L].length} ключей не хватает`);
}
// Покажем первые 25 примеров для KK (обычно самый «дырявый»)
if (missing.KK.length) console.log('  KK примеры:', missing.KK.slice(0, 25).join(', '));
