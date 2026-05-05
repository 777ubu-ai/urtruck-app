// i18n smoke check — verifies our enabled languages and fallback chain.
//
// Pass criteria:
//  - Uzbek must NOT be in the enabled-languages list.
//  - Every enabled language must be a real translations object.
//  - Every key referenced from src/ via t('...') must exist in RU (the
//    base fallback). If a key is missing in RU there is no chain that
//    can resolve it — so this catches dead/stale t() calls.
//  - Reports per-language coverage so the operator can prioritise
//    follow-up translation work.
//
// Non-failing observations (printed but not fatal):
//  - keys missing in non-RU languages (those resolve via t()'s
//    `lang[k] || RU[k] || k` fallback chain in src/utils/i18n.js).

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const I18N = path.join(ROOT, 'src', 'utils', 'i18n.js');
const SRC = path.join(ROOT, 'src');
// Enabled set: RU / EN / KK (Kazakh, ISO 639-1) / ZH (Chinese, ISO
// 639-1). Stage 5 narrowed the set to four; Stage 7 standardised
// the codes from the country abbreviations KZ/CN to the proper
// language codes KK/ZH so they stop colliding with country codes
// elsewhere (cities.js, FX widget). Everything else is FORBIDDEN —
// the smoke fails if any of these reappear in translations.
const ENABLED = ['RU', 'EN', 'KK', 'ZH'];
const FORBIDDEN = ['UZ', 'KG', 'DE', 'FR', 'TJ', 'GE', 'TM', 'KZ', 'CN'];

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
  // t('key') / t("key") / tGlobal('key')
  const re = /\bt(?:Global)?\(\s*['"]([a-zA-Z0-9_:.-]+)['"]/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const k = m[1];
    // Dynamic-prefix call sites like t('push_cat_' + cat.key) — the key
    // captured here ends with `_` and is concatenated at runtime, not a
    // real key on its own. Skip those.
    if (k.endsWith('_')) continue;
    keys.add(k);
  }
  return keys;
}

function main() {
  const t = loadTranslations();
  const failures = [];

  // 1. Uzbek must be gone
  for (const code of FORBIDDEN) {
    if (t[code]) failures.push(`forbidden language still present: ${code}`);
  }

  // 2. Each enabled lang must be a real object
  for (const code of ENABLED) {
    if (!t[code] || typeof t[code] !== 'object') {
      failures.push(`enabled language missing: ${code}`);
    }
  }

  // 3. Collect t() keys referenced in src/ and verify against RU
  const allKeys = new Set();
  for (const f of walk(SRC)) {
    extractTKeys(f).forEach((k) => allKeys.add(k));
  }
  const ruKeys = new Set(Object.keys(t.RU || {}));
  const missingInRu = [...allKeys].filter((k) => !ruKeys.has(k));
  if (missingInRu.length) {
    failures.push(`RU is missing ${missingInRu.length} keys referenced in src/: ${missingInRu.slice(0, 10).join(', ')}${missingInRu.length > 10 ? '…' : ''}`);
  }

  // 4. Per-language coverage. With only four enabled languages we
  // require ZERO missing keys at every call site — there is no
  // fall-back excuse left.
  console.log(`[i18n] enabled langs: ${ENABLED.join(', ')}`);
  console.log(`[i18n] forbidden absent: ${FORBIDDEN.join(', ')}`);
  console.log(`[i18n] t() call sites in src/: ${allKeys.size} unique keys`);
  for (const l of ENABLED) {
    const have = Object.keys(t[l] || {}).length;
    const usedMissing = [...allKeys].filter((k) => !t[l] || !t[l][k]);
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
