// i18n smoke check — verifies our enabled languages and fallback chain.
//
// Pass criteria:
//  - Uzbek must NOT be in the enabled-languages list.
//  - Every enabled language must be a real translations object.
//  - Every key referenced from src/ via t('...') must exist in RU (the
//    base fallback), or be an explicit alias to an existing translated key.
//  - Reports per-language coverage so the operator can prioritise
//    follow-up translation work.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const I18N = path.join(ROOT, 'src', 'utils', 'i18n.js');
const SRC = path.join(ROOT, 'src');
const ENABLED = ['RU', 'EN', 'KK', 'ZH'];
const FORBIDDEN = ['UZ', 'KG', 'DE', 'FR', 'TJ', 'GE', 'TM', 'KZ', 'CN'];

// RC1: confirmation prompts intentionally reuse existing translated action
// copy through useI18n aliases. The smoke resolves those aliases instead of
// requiring duplicate dictionary entries in four languages.
const KEY_ALIASES = {
  confirm_mark_delivered: 'mark_arrived',
  confirm_receipt: 'confirm_delivery',
};
const resolveKey = (key) => KEY_ALIASES[key] || key;

function loadTranslations() {
  const src = fs.readFileSync(I18N, 'utf8');
  const m = src.match(/const translations = (\{[\s\S]*?\n\};)/);
  if (!m) throw new Error('i18n.js: translations object not found');
  // eslint-disable-next-line no-eval
  return eval('(' + m[1].slice(0, -1) + ')');
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) out.push(p);
  }
  return out;
}

function extractTKeys(filepath) {
  const src = fs.readFileSync(filepath, 'utf8');
  const keys = new Set();
  const re = /\bt(?:Global)?\(\s*['"]([a-zA-Z0-9_:.-]+)['"]/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const k = m[1];
    if (k.endsWith('_')) continue;
    keys.add(k);
  }
  return keys;
}

function main() {
  const t = loadTranslations();
  const failures = [];

  for (const code of FORBIDDEN) {
    if (t[code]) failures.push(`forbidden language still present: ${code}`);
  }

  for (const code of ENABLED) {
    if (!t[code] || typeof t[code] !== 'object') {
      failures.push(`enabled language missing: ${code}`);
    }
  }

  const allKeys = new Set();
  for (const f of walk(SRC)) {
    extractTKeys(f).forEach((k) => allKeys.add(k));
  }
  const ruKeys = new Set(Object.keys(t.RU || {}));
  const missingInRu = [...allKeys].filter((k) => !ruKeys.has(resolveKey(k)));
  if (missingInRu.length) {
    failures.push(`RU is missing ${missingInRu.length} keys referenced in src/: ${missingInRu.slice(0, 10).join(', ')}${missingInRu.length > 10 ? '…' : ''}`);
  }

  console.log(`[i18n] enabled langs: ${ENABLED.join(', ')}`);
  console.log(`[i18n] forbidden absent: ${FORBIDDEN.join(', ')}`);
  console.log(`[i18n] aliases: ${Object.entries(KEY_ALIASES).map(([a, b]) => `${a}->${b}`).join(', ')}`);
  console.log(`[i18n] t() call sites in src/: ${allKeys.size} unique keys`);
  for (const l of ENABLED) {
    const have = Object.keys(t[l] || {}).length;
    const usedMissing = [...allKeys].filter((k) => !t[l] || !t[l][resolveKey(k)]);
    console.log(`[i18n] ${l}: ${have} keys; missing at call sites: ${usedMissing.length}`);
    if (usedMissing.length > 0) {
      failures.push(`${l} is missing ${usedMissing.length} call-site keys: ${usedMissing.slice(0, 10).join(', ')}${usedMissing.length > 10 ? '…' : ''}`);
    }
  }

  if (failures.length) {
    console.log('\n[i18n] FAIL:');
    failures.forEach((f) => console.log('  -', f));
    process.exit(1);
  }
  console.log('\n[i18n] OK');
}

main();
