import fs from 'node:fs';
import assert from 'node:assert/strict';

const wrapper = fs.readFileSync('src/screens/QueueScreen.js', 'utf8');
const screen = fs.readFileSync('src/screens/QueueScreenLazy.js', 'utf8');
const lazyApi = fs.readFileSync('backend/api/borders_lazy.py', 'utf8');
const detailService = fs.readFileSync('backend/cgr/checkpoint_detail_service.py', 'utf8');
const apiInit = fs.readFileSync('backend/api/__init__.py', 'utf8');
const nav = fs.readFileSync('src/components/ui/v1/BottomNav.js', 'utf8');
const i18n = fs.readFileSync('src/utils/i18n.js', 'utf8');

assert.ok(wrapper.includes("./QueueScreenLazy"), 'Border route must use lazy screen');
assert.ok(screen.includes('`${BASE}/catalog`'), 'Initial Border load must use lightweight /catalog');
assert.ok(screen.includes('`${BASE}/live/${encodeURIComponent(checkpoint.id)}'), 'Checkpoint tap must use per-checkpoint /live endpoint');
assert.ok(!screen.includes('`${BASE}/best`'), 'Initial screen must not fan out through /best');
assert.ok(!screen.includes('`${BASE}/countries`'), 'Initial screen must not load live country aggregates');
assert.ok(!screen.includes('`${BASE}?country=`'), 'Initial screen must not load live data for all checkpoints');
assert.ok(screen.includes('border-checkpoint-carousel'), 'Horizontal checkpoint carousel required');
assert.ok(screen.includes('border-checkpoint-chip'), 'Checkpoint tap cards required');
assert.ok(screen.includes('border-lazy-prompt'), 'Driver must be prompted to tap before live CGR loading');
assert.ok(screen.includes('border-live-loading'), 'Selected checkpoint must show a CGR loading state');
assert.ok(screen.includes('border-selected-card'), 'Selected checkpoint live card required');
assert.ok(screen.includes('border-booking-calendar'), 'Booking availability calendar required');
assert.ok(screen.includes('nearest_booking_free'), 'Nearest free slot count required');
assert.ok(screen.includes('current_board_count'), 'Operational online-board count must remain distinct from booking availability');
assert.ok(screen.includes('daily_capacity'), 'Daily capacity metric required');
assert.ok(screen.includes('?force=true'), 'Manual refresh must bypass backend cache for selected checkpoint only');

assert.ok(lazyApi.includes('@lazy_border_router.get("/catalog")'), 'Lazy catalogue endpoint required');
assert.ok(lazyApi.includes('@lazy_border_router.get("/live/{code}")'), 'Lazy live checkpoint endpoint required');
assert.ok(lazyApi.includes('cgr_requests": 0'), 'Catalogue must explicitly remain network-free');
assert.ok(detailService.includes('_CACHE_TTL_SEC = 5 * 60'), 'Five-minute checkpoint cache required');
assert.ok(detailService.includes('asyncio.gather('), 'Selected checkpoint detail and board should load concurrently');
assert.ok(detailService.includes('"/ru/registry/scoreboard"'), 'Current board count must use official CGR scoreboard');
assert.ok(detailService.includes('f"/ru/registry/checkpoint/list/{external_id}/view"'), 'Booking grid and limits must use exact checkpoint detail page');
assert.ok(detailService.includes('nearest_standard'), 'Nearest standard booking must be parsed');
assert.ok(detailService.includes('nearest_premium'), 'Premium booking availability must remain separately visible');
assert.ok(detailService.includes('waiting_area_supported": False'), 'Unsupported per-checkpoint waiting-area count must not be fabricated');
assert.ok(apiInit.includes('_borders_router.routes[0:0]'), 'Specific lazy routes must precede legacy /{border_id} matcher');

assert.ok(nav.includes("t('tab_border')"), 'Bottom navigation must label Queue route as Border');
for (const marker of ["tab_border: 'Граница'", "tab_border: 'Шекара'", "tab_border: '边境'", "tab_border: 'Border'"]) {
  assert.ok(i18n.includes(marker), `Missing i18n marker: ${marker}`);
}

console.log('border dashboard smoke OK: local catalogue + tap-to-load CGR + booking calendar + 5m cache');
