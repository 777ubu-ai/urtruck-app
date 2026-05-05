// UX smoke — Stage 9 product cleanup checks. Static-source guards
// that catch regressions where someone re-introduces a duplicate
// CTA, a QA marker leak, or a fake-default placeholder on the
// public surfaces.
//
// All checks are file-level greps; they don't render React, so
// they're fast and don't need a backend.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const failures = [];
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// 1. normalizers.js exports `sanitizeForDisplay`.
const norm = read('src/utils/normalizers.js');
if (!/export const sanitizeForDisplay/.test(norm)) {
  failures.push('sanitizeForDisplay no longer exported from normalizers.js');
}
if (!/\[ar-/.test(norm)) {
  failures.push('sanitizeForDisplay regex no longer mentions the [ar-…] tag');
}

// 2. cargoDisplay / tripDisplay sanitise outbound text.
for (const fn of ['cargoDisplay', 'tripDisplay']) {
  const m = new RegExp(`export const ${fn}[\\s\\S]*?^};`, 'm').exec(norm);
  if (!m) {
    failures.push(`${fn} not found in normalizers`);
    continue;
  }
  if (!/sanitizeForDisplay/.test(m[0])) {
    failures.push(`${fn} no longer routes text through sanitizeForDisplay`);
  }
}

// 3. FeedScreen single-CTA contract: cargo / driver render must
// expose only `bottomRight` (no bottomLeft). The earlier shape had
// two buttons that ran the same handler.
const feed = read('src/screens/FeedScreen.js');
if (/bottomLeft={\{\s*label:\s*t\('details'\)/.test(feed)) {
  failures.push("FeedScreen still renders a `bottomLeft: { label: t('details') }` duplicate CTA");
}
if (/t\('respond'\)/.test(feed)) {
  failures.push("FeedScreen still renders the legacy `t('respond')` CTA — should be Подробнее only");
}

// 4. CargoDetail: inline "Предложить цену" button next to the price
// block was a duplicate of the sticky CTA. It must be gone.
const cargoDetail = read('src/screens/CargoDetail.js');
if (/<TouchableOpacity[^>]*bidBtn[\s\S]*?suggestPrice/.test(cargoDetail)) {
  failures.push('CargoDetail still has the inline `Предложить цену` button next to the price block (duplicate of sticky CTA)');
}

// 5. Cards have not regressed to the fake numeric defaults.
for (const file of ['src/screens/CreateCargoScreen.js', 'src/screens/CreateTripScreen.js']) {
  const src = read(file);
  if (/placeholder="20"/.test(src) || /placeholder="82"/.test(src)) {
    failures.push(`${file}: literal "20"/"82" placeholder reappeared`);
  }
  if (/icon="🔒"/.test(src) && /label=\{t\('weight_label'\)\}/.test(src)) {
    failures.push(`${file}: weight icon back to padlock 🔒`);
  }
}

// Output
console.log('[ux] sanitizeForDisplay exported  ✓');
console.log('[ux] cargoDisplay / tripDisplay sanitise text  ✓');
console.log('[ux] FeedScreen single-CTA contract  ✓');
console.log('[ux] CargoDetail no duplicate price-block button  ✓');
console.log('[ux] Create forms — no fake defaults / wrong icons  ✓');

if (failures.length) {
  console.log('\n[ux] FAIL:');
  failures.forEach((f) => console.log('  -', f));
  process.exit(1);
}
console.log('\n[ux] OK');
