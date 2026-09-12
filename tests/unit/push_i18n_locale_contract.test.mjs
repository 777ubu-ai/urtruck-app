// Push locale contract: backend/services/push_i18n.py supports all 16
// i18n-16 locale codes and defaults to EN (never RU) for an
// unknown/missing locale.
//
// Split out of tests/unit/i18n16.test.mjs (PR #357 review, item 2): that
// file lives in the I18N CONTENT PR, but push_i18n.py's DEFAULT_LOCALE
// RU→EN change is its own separate PR (feat/push-default-locale-en-*)
// pending explicit product-owner approval — a content-PR test asserting
// backend push-default behavior straddled both PRs, so it now lives with
// the PR whose scope it actually verifies.
//
//   node tests/unit/push_i18n_locale_contract.test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const NEW_LOCALES = ['UZ', 'KY', 'TG', 'DE', 'FR', 'PL', 'LT', 'LV', 'IT', 'TR', 'BE', 'RO'];

let failed = 0;
function ok(desc, cond) {
  if (cond) {
    console.log(`  ok: ${desc}`);
  } else {
    failed++;
    console.log(`FAIL: ${desc}`);
  }
}

const pushSrc = read('backend/services/push_i18n.py');
ok('push_i18n.py SUPPORTED_LOCALES has 16 entries', (pushSrc.match(/SUPPORTED_LOCALES = \(([\s\S]*?)\)/)[1].match(/"[A-Z]{2}"/g) || []).length === 16);
ok('push_i18n.py DEFAULT_LOCALE is EN, not RU', /DEFAULT_LOCALE = "EN"/.test(pushSrc));
for (const code of NEW_LOCALES) {
  ok(`push_i18n.py TEMPLATES reference "${code}"`, pushSrc.includes(`"${code}":`));
}

console.log(failed === 0 ? '\nAll push_i18n locale-contract tests passed.' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
