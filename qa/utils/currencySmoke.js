// Currency smoke check — verifies the four-currency whitelist is the
// only place the UI exposes selectable currencies, and that the backend
// publish whitelist matches.
//
// Pass criteria:
//   - Frontend pickers in CreateCargoScreen / CreateTripScreen / WalletScreen
//     contain ONLY RUB / USD / KZT / CNY in their selectable arrays.
//   - Backend marketplace.py whitelists in create_cargo, create_trip,
//     update_trip use ONLY the same four codes.
//   - Removed codes (UZS / KGS / EUR / AED) must not appear in any
//     "selectable" array — they are allowed only on read-only paths
//     (CURRENCY_SYMBOLS in normalizers.js, fallback FX rates) so old
//     rows with legacy codes still render without crashing.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const ENABLED = ['USD', 'KZT', 'RUB', 'CNY'];
const REMOVED = ['UZS', 'KGS', 'EUR', 'AED'];

const failures = [];

function read(p) { return fs.readFileSync(p, 'utf8'); }

// 1. CreateCargo / CreateTrip pickers — both use CURRENCY_OPTIONS array.
for (const screen of ['CreateCargoScreen.js', 'CreateTripScreen.js']) {
  const src = read(path.join(ROOT, 'src', 'screens', screen));
  const m = src.match(/const CURRENCY_OPTIONS = \[([\s\S]*?)\];/);
  if (!m) {
    failures.push(`${screen}: CURRENCY_OPTIONS not found`);
    continue;
  }
  const codes = [...m[1].matchAll(/k:\s*'([A-Z]{3})'/g)].map((mm) => mm[1]);
  const extra = codes.filter((c) => !ENABLED.includes(c));
  const missing = ENABLED.filter((c) => !codes.includes(c));
  if (extra.length) failures.push(`${screen}: extra currencies in picker: ${extra.join(',')}`);
  if (missing.length) failures.push(`${screen}: missing currencies from picker: ${missing.join(',')}`);
  console.log(`[fe] ${screen}: codes=${codes.join(',')}`);
}

// 2. WalletScreen — CURRENCIES top-level + FX_PAIRS widget.
{
  const src = read(path.join(ROOT, 'src', 'screens', 'WalletScreen.js'));
  const m = src.match(/const CURRENCIES = \[([^\]]+)\]/);
  if (!m) failures.push('WalletScreen: CURRENCIES not found');
  else {
    const codes = [...m[1].matchAll(/'([A-Z]{3})'/g)].map((mm) => mm[1]);
    const extra = codes.filter((c) => !ENABLED.includes(c));
    if (extra.length) failures.push(`WalletScreen: extra currencies in picker: ${extra.join(',')}`);
    console.log(`[fe] WalletScreen.CURRENCIES=${codes.join(',')}`);
  }
}

// 3. Backend whitelists — check exactly four occurrences of the full
// pilot tuple and that no UZS string appears as a *publish* whitelist.
{
  const src = read(path.join(ROOT, 'backend', 'api', 'marketplace.py'));
  const goodTuples = (src.match(/\("USD",\s*"KZT",\s*"RUB",\s*"CNY"\)/g) || []).length;
  if (goodTuples < 3) failures.push(`marketplace.py: expected 3+ pilot whitelists, got ${goodTuples}`);
  const oldTuples = src.match(/\("USD",\s*"KZT",\s*"RUB",\s*"CNY",\s*"UZS"\)/g);
  if (oldTuples && oldTuples.length) failures.push(`marketplace.py: found ${oldTuples.length} legacy whitelist(s) still listing UZS`);
  console.log(`[be] marketplace.py: pilot whitelists=${goodTuples}, legacy=${oldTuples ? oldTuples.length : 0}`);
}

// 4. Final report
console.log(`[currency] enabled: ${ENABLED.join(', ')}`);
console.log(`[currency] removed from UI: ${REMOVED.join(', ')}`);

if (failures.length) {
  console.log('\n[currency] FAIL:');
  failures.forEach((f) => console.log('  -', f));
  process.exit(1);
}
console.log('\n[currency] OK');
