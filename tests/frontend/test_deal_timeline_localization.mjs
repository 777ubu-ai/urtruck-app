// Track: Claude harness fix, P1 (2026-09-08/09).
//
// Root cause (confirmed in the integration audit, not re-derived here):
// `deal_event_status_received` was missing entirely in all 4 languages,
// and `deal_event_status_completed` held text that actually describes
// "received" ('✅ Получение подтверждено' / receipt confirmed), copied
// from a different domain state. DealRoom.js's systemEventText() looks up
// `deal_event_status_${payload.status}` (used by both DealRoom.js's own
// system-message rendering and DealStatusTimeline.js, which imports the
// same function) — with the bug, a "received" event fell back to the
// generic "Статус сделки изменён" (key missing -> t() returns the raw
// key or falls through to the generic changed-text), and a "completed"
// event showed receipt-confirmation text instead of deal-completion text.
//
// Fix: added deal_event_status_received (moved the correct pre-existing
// text there) and gave deal_event_status_completed its own, distinct,
// accurate text in all 4 languages — matching the terminology already
// used elsewhere (backend push labels, zhLocalizationSmoke's tested
// "🤝 Сделка завершена" / "🤝 交易已完成" pair for RU/ZH).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const i18n = readFileSync('src/utils/i18n.js', 'utf8');
const LANG_BLOCKS = { RU: [10, 2091], KK: [2091, 3917], ZH: [3917, 5725], EN: [5725, 7660] };
const lines = i18n.split('\n');

function keyValue(block, key) {
  const m = block.match(new RegExp(`${key}:\\s*'([^']*)'`));
  return m ? m[1] : null;
}

test('every supported locale defines both deal_event_status_received and deal_event_status_completed', () => {
  for (const [lang, [start, end]] of Object.entries(LANG_BLOCKS)) {
    const block = lines.slice(start, end).join('\n');
    const received = keyValue(block, 'deal_event_status_received');
    const completed = keyValue(block, 'deal_event_status_completed');
    assert.ok(received, `${lang}: deal_event_status_received is missing`);
    assert.ok(completed, `${lang}: deal_event_status_completed is missing`);
  }
});

test('received and completed are never the same text, in any locale (the actual bug)', () => {
  for (const [lang, [start, end]] of Object.entries(LANG_BLOCKS)) {
    const block = lines.slice(start, end).join('\n');
    const received = keyValue(block, 'deal_event_status_received');
    const completed = keyValue(block, 'deal_event_status_completed');
    assert.notEqual(received, completed, `${lang}: received and completed must describe different states`);
  }
});

test('DealStatusTimeline.js and DealRoom.js resolve deal_event_status_${payload.status} through the same shared function', () => {
  const dealRoom = readFileSync('src/components/deal/DealRoom.js', 'utf8');
  const timeline = readFileSync('src/components/deal/DealStatusTimeline.js', 'utf8');
  assert.match(dealRoom, /export function systemEventText\(t, ev\)/);
  assert.match(dealRoom, /t\(`deal_event_status_\$\{p\.status\}`\)/);
  assert.match(timeline, /import \{ systemEventText \} from '.\/DealRoom'/);
});
