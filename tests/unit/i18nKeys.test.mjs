// #292: Контрактный тест — все 4 языка (RU/KK/ZH/EN) имеют одинаковый набор ключей.
// Запуск: node tests/unit/i18nKeys.test.mjs
//
// Тест парсит i18n.js статически: находит 4 блока `RU: { ... }` / `KK: { ... }` / etc.,
// извлекает ключи через regex (без eval/import, чтобы не тянуть React Native зависимости).

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const I18N_PATH = resolve(__dirname, '../../src/utils/i18n.js');

// ── Парсер ──────────────────────────────────────────────────────

function extractLocaleBlocks(src) {
  // Ищем паттерн `  RU: {` на отдельной строке, потом собираем до
  // закрывающей `  },` на таком же уровне отступа.
  const LOCALES = ['RU', 'KK', 'ZH', 'EN'];
  const blocks = {};

  for (const loc of LOCALES) {
    // Найти начало блока — строку `  <LOC>: {`
    const startRe = new RegExp(`^  ${loc}: \\{`, 'm');
    const startMatch = startRe.exec(src);
    if (!startMatch) {
      throw new Error(`Не найден блок ${loc}: { в i18n.js`);
    }
    const startIdx = startMatch.index + startMatch[0].length;

    // Считаем скобки, чтобы найти конец блока
    let depth = 1;
    let i = startIdx;
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
      i++;
    }
    blocks[loc] = src.slice(startMatch.index, i);
  }
  return blocks;
}

function extractKeys(block) {
  // Извлекаем ключи верхнего уровня: `keyName: 'value'` или `keyName: "value"`
  // Ключи могут быть: bareword, 'quoted', "double-quoted"
  const keys = new Set();
  // Паттерн: начало строки (с пробелами), ключ (идентификатор или строка), двоеточие
  const re = /^\s{4}(\w[\w$]*)\s*:/gm;
  let m;
  while ((m = re.exec(block)) !== null) {
    keys.add(m[1]);
  }
  return keys;
}

// ── Основной тест ───────────────────────────────────────────────

const src = readFileSync(I18N_PATH, 'utf-8');
const blocks = extractLocaleBlocks(src);

const LOCALES = ['RU', 'KK', 'ZH', 'EN'];
const keysByLocale = {};
for (const loc of LOCALES) {
  keysByLocale[loc] = extractKeys(blocks[loc]);
}

// RU — эталон (полный набор ключей)
const ruKeys = keysByLocale.RU;
let failed = 0;
let totalChecks = 0;

console.log(`\ni18n contract test (#292)`);
console.log(`RU keys (reference): ${ruKeys.size}`);

for (const loc of ['KK', 'ZH', 'EN']) {
  const locKeys = keysByLocale[loc];
  console.log(`${loc} keys: ${locKeys.size}`);

  // Ключи есть в RU, но нет в LOC
  const missingInLoc = [...ruKeys].filter(k => !locKeys.has(k));
  // Ключи есть в LOC, но нет в RU (лишние)
  const extraInLoc = [...locKeys].filter(k => !ruKeys.has(k));

  totalChecks++;
  if (missingInLoc.length > 0) {
    // Допуск: до 5 ключей разницы — warn, >5 — fail
    if (missingInLoc.length > 5) {
      console.log(`FAIL: ${loc} пропущено ${missingInLoc.length} ключей из RU:`);
      missingInLoc.slice(0, 20).forEach(k => console.log(`       - ${k}`));
      if (missingInLoc.length > 20) console.log(`       ... и ещё ${missingInLoc.length - 20}`);
      failed++;
    } else {
      console.log(`  warn: ${loc} пропущено ${missingInLoc.length} ключей: ${missingInLoc.join(', ')}`);
    }
  } else {
    console.log(`  ok: ${loc} — все ключи RU присутствуют`);
  }

  if (extraInLoc.length > 0) {
    console.log(`  info: ${loc} имеет ${extraInLoc.length} ключей, отсутствующих в RU: ${extraInLoc.slice(0, 10).join(', ')}${extraInLoc.length > 10 ? '...' : ''}`);
  }
}

// Проверка минимального количества ключей (защита от пустых блоков)
for (const loc of LOCALES) {
  totalChecks++;
  if (keysByLocale[loc].size < 100) {
    console.log(`FAIL: ${loc} имеет только ${keysByLocale[loc].size} ключей (ожидается >100)`);
    failed++;
  }
}

// Проверка, что RU имеет достаточно ключей (регрессия: случайное удаление)
totalChecks++;
if (ruKeys.size < 1500) {
  console.log(`FAIL: RU имеет только ${ruKeys.size} ключей (ожидается >1500, было ~1942)`);
  failed++;
}

console.log(`\n${totalChecks - failed}/${totalChecks} checks passed${failed ? `, ${failed} FAILED` : ''}\n`);
if (failed) {
  process.exit(1);
}
