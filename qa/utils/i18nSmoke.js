// i18n smoke check — verifies our enabled languages and fallback chain.
//
// Pass criteria:
//  - Every enabled language must be a real translations object.
//  - No UNAPPROVED language code is present (FORBIDDEN below) — this used
//    to guard against someone adding a locale ahead of an actual product
//    decision to support it.
//  - Every key referenced from src/ via t('...') must exist in RU (the
//    base fallback), or be an explicit alias to an existing translated key.
//  - Reports per-language coverage so the operator can prioritise
//    follow-up translation work.
//
// I18N-16 (2026-09-12): UZ/KY/TG/DE/FR/PL/LT/LV/IT/TR/BE/RO were added as
// real, product-approved locales (feat/claude-i18n-16-locales-20260912;
// canonical registry: src/utils/localeRegistry.js). This smoke's own
// FORBIDDEN list previously named UZ/DE/FR explicitly (plus KG/TJ/GE/TM/
// KZ/CN, which never matched our actual internal codes) as "must not be
// added yet" placeholders — that decision has now been made, so those
// three move to ENABLED and out of FORBIDDEN. GE (Georgia/Georgian) and
// TM (Turkmenistan/Turkmen) were never part of this expansion and stay
// forbidden; KZ/CN remain forbidden as legacy COUNTRY codes (Kazakhstan/
// China) that must never be locale keys — see LEGACY_LANG_FIX in i18n.js,
// which migrates old persisted values away from them, not into new
// dictionary entries.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const I18N = path.join(ROOT, 'src', 'utils', 'i18n.js');
const SRC = path.join(ROOT, 'src');
const ENABLED = ['RU', 'EN', 'KK', 'ZH', 'UZ', 'KY', 'TG', 'DE', 'FR', 'PL', 'LT', 'LV', 'IT', 'TR', 'BE', 'RO'];
const FORBIDDEN = ['GE', 'TM', 'KZ', 'CN'];

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

  // I18N-16 (2026-09-12): the 4 original locales (RU/EN/KK/ZH) carry the
  // full ~2000-key dictionary and must have ZERO call-site gaps, same as
  // always. The 12 newly added locales deliberately cover only a bounded
  // CORE_KEYS set (~280 keys — auth/registration/statuses/cargo/gates/
  // validation/photo-voice/errors/navigation/filters/chat-attachments/
  // GPS-map/push + backend error codes); any OTHER call-site key falls
  // back to EN through the existing t()/translate() contract, which is
  // the explicitly approved behaviour for this track (never a crash,
  // never silently RU) — so a gap there is reported, not failed.
  const FULL_COVERAGE_LOCALES = ['RU', 'EN', 'KK', 'ZH'];
  console.log(`[i18n] enabled langs: ${ENABLED.join(', ')}`);
  console.log(`[i18n] forbidden absent: ${FORBIDDEN.join(', ')}`);
  console.log(`[i18n] aliases: ${Object.entries(KEY_ALIASES).map(([a, b]) => `${a}->${b}`).join(', ')}`);
  console.log(`[i18n] t() call sites in src/: ${allKeys.size} unique keys`);
  for (const l of ENABLED) {
    const have = Object.keys(t[l] || {}).length;
    const usedMissing = [...allKeys].filter((k) => !t[l] || !t[l][resolveKey(k)]);
    const full = FULL_COVERAGE_LOCALES.includes(l);
    console.log(`[i18n] ${l}: ${have} keys; missing at call sites: ${usedMissing.length}${full ? '' : ' (CORE_KEYS locale — falls back to EN, informational only)'}`);
    if (usedMissing.length > 0 && full) {
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
