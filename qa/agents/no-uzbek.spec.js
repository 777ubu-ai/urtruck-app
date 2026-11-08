// Stage 52 — P0-4 grep-test: no Uzbek in user-facing UI.
//
// История: после Stage 47-49 язык UZ был выпилен из общего i18n catalog,
// но в src/screens/ChatScreen.js остался legacy локальный LANGS, в котором
// 'UZ' дублировал глобальный селектор. На TestFlight build 1 пользователь
// видел «Ўзбекча» в pill чата, при том что переключение ничего не делало.
//
// Этот тест ловит регрессии: ни один спекулятивный UZ/Uzbek/Узбекча
// не должен появиться в user-facing UI (src/screens, src/components),
// КРОМЕ ссылок на Узбекистан как страну/город (это нужная бизнес-логика
// для маршрутов KZ↔UZ и i18n ключа country_UZ).
//
// Запуск: npx playwright test qa/agents/no-uzbek.spec.js --config=qa/playwright.config.js
// или: node qa/agents/no-uzbek.spec.js  (standalone, без playwright runner)

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCAN_DIRS = ['src/screens', 'src/components'];

// Что считается «UZ как язык» — обычно встречается в LANGS/LANG_KEYS
// или в TextNode «Ўзбекча»/«Узбекча»/«Uzbek».
const FORBIDDEN_PATTERNS = [
  /\b['"]uz['"]\b/i,                 // 'uz' или "uz" как code (не uz_*-suffix)
  /\bUzbek\b/,                       // Uzbek
  /Ўзбекча|Узбекча|O['‘]zbek/i,      // нативные написания
];

// Что считается легитимной ссылкой на Узбекистан-как-страну и должно быть allowed.
const ALLOWED_SUBSTRINGS = [
  'country_UZ',          // i18n-ключ страны
  '"UZ"',                // ISO country code в FLAGS/cities/geography
  "'UZ'",                // то же
  'flag-UZ',             // emoji/flag refs
  '🇺🇿',                  // emoji
];

// PR #20 — отдельный strict-режим: ловит UZ в language picker массивах,
// даже если строка содержит ISO 'UZ' (которое разрешено для country
// references). Срабатывает только если строка одновременно содержит
// `code:` / `lang:` ключ И один из локально-узбекских токенов или
// явную метку label/labelKey с словом Uzbek/Oʻzbek/Ўзбек/Узбек.
//
// История: до PR #20 баseline-тест пропускал
//   { code: 'UZ', label: 'Oʻzbekcha', flag: '🇺🇿' }
// потому что 'UZ' содержалось в ALLOWED_SUBSTRINGS. Это правильно для
// strings типа `'UZ'` (ISO), но ошибочно для language-picker массивов.
const LANGUAGE_PICKER_PATTERNS = [
  // `code: 'UZ'` или `lang: 'UZ'` или `key: 'UZ'` в одной строке
  /(code|lang|key|locale)\s*:\s*['"]uz['"]/i,
  // `label: 'Oʻzbekcha'` / `label: 'Узбекча'` (язык как label)
  /label\s*:\s*['"][^'"]*(O['‘]zbekcha|Ўзбекча|Узбекча|Uzbek)/i,
];

function listJsFiles(dir, out = []) {
  const abs = path.join(REPO_ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) listJsFiles(rel, out);
    else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

function scan() {
  const violations = [];
  const files = SCAN_DIRS.flatMap((d) => listJsFiles(d));
  for (const rel of files) {
    const abs = path.join(REPO_ROOT, rel);
    const text = fs.readFileSync(abs, 'utf8');
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      // Слой 1: forbidden patterns + business-geography allowlist.
      for (const pat of FORBIDDEN_PATTERNS) {
        if (pat.test(line) && !ALLOWED_SUBSTRINGS.some((a) => line.includes(a))) {
          violations.push({ file: rel, lineNo: i + 1, line: line.trim(), kind: 'forbidden' });
          break;
        }
      }
      // Слой 2: language-picker strict — ловит `code: 'UZ'` / Oʻzbekcha
      // даже если строка попадает в business-geography allowlist.
      for (const pat of LANGUAGE_PICKER_PATTERNS) {
        if (pat.test(line)) {
          violations.push({ file: rel, lineNo: i + 1, line: line.trim(), kind: 'language-picker' });
          break;
        }
      }
    });
  }
  return violations;
}

// Playwright wrapper (если запущено из playwright runner)
try {
  const { test, expect } = require('@playwright/test');
  test('Stage 52 / P0-4: no Uzbek language refs in user-facing UI', async () => {
    const violations = scan();
    const msg = violations
      .map((v) => `  ${v.file}:${v.lineNo}: ${v.line}`)
      .join('\n');
    expect(violations, `Found UZ language refs:\n${msg}`).toHaveLength(0);
  });
} catch (e) {
  // Запущено как standalone node script
  if (require.main === module) {
    const violations = scan();
    if (violations.length === 0) {
      console.log('✅ no-uzbek check passed (0 violations)');
      process.exit(0);
    }
    console.error('❌ no-uzbek check FAILED:');
    for (const v of violations) console.error(`  ${v.file}:${v.lineNo}: ${v.line}`);
    process.exit(1);
  }
}

module.exports = { scan };
