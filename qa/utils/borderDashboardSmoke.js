import fs from 'node:fs';
import assert from 'node:assert/strict';

const screen = fs.readFileSync('src/screens/QueueScreenCarousel.js', 'utf8');
const api = fs.readFileSync('backend/api/borders.py', 'utf8');
const nav = fs.readFileSync('src/components/ui/v1/BottomNav.js', 'utf8');
const i18n = fs.readFileSync('src/utils/i18n.js', 'utf8');

assert.ok(screen.includes('`${BASE}/best`'), 'Border home must use /borders/best');
assert.ok(screen.includes('`${BASE}/countries`'), 'Border home must use /borders/countries');
assert.ok(screen.includes("source === 'cgr' || source === 'official'"), 'Only CGR/official source may be rendered as current');
assert.ok(screen.includes("status = 'stale'"), 'Stale state must be explicit');
assert.ok(screen.includes("status = 'no_data'"), 'No-data state must be explicit');
assert.ok(!/trucks_in_queue\s*\?\?\s*0/.test(screen), 'null queue must never silently become 0');
assert.ok(screen.includes('rawQueue == null'), 'null and real zero must be distinguished');
assert.ok(screen.includes('border-crossing-detail'), 'Crossing detail proof id required');
assert.ok(screen.includes('border-country-${code}'), 'Country filters required');
assert.ok(screen.includes('border-checkpoint-carousel'), 'Horizontal checkpoint carousel required');
assert.ok(screen.includes('border-checkpoint-chip'), 'Checkpoint tap cards required');
assert.ok(screen.includes('border-selected-card'), 'Selected checkpoint live card required');
assert.ok(screen.includes('nearestBooking'), 'Nearest booking metric required');
assert.ok(screen.includes('waitingArea'), 'Waiting-area metric required');
assert.ok(screen.includes('dailyLimit'), 'Daily-capacity metric required');
assert.ok(screen.includes('ur_border_favorites_v1'), 'Favorites persistence required');
assert.ok(screen.includes('ur_border_saved_plates_v1'), 'Saved vehicle persistence required');

assert.ok(api.includes('@borders_router.get("/best")'), 'Backend /best endpoint required');
assert.ok(api.includes('@borders_router.get("/countries")'), 'Backend /countries endpoint required');
assert.ok(api.includes('if q is None:'), 'Backend must distinguish no-data from zero');
assert.ok(api.includes('if c.get("status") != "ok"'), 'Best crossing must exclude stale/unavailable records');
assert.ok(api.includes('"best": None'), 'Best endpoint must return null instead of fake fallback');

assert.ok(nav.includes("t('tab_border')"), 'Bottom navigation must label Queue route as Border');
for (const marker of ["tab_border: 'Граница'", "tab_border: 'Шекара'", "tab_border: '边境'", "tab_border: 'Border'"]) {
  assert.ok(i18n.includes(marker), `Missing i18n marker: ${marker}`);
}

console.log('border dashboard smoke OK: CGR real-source contract + compact driver carousel + booking metrics');
