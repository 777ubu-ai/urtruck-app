import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const deals = fs.readFileSync('src/screens/DealsScreen.js', 'utf8');

test('delivered remains in In progress until shipper confirms receipt', () => {
  assert.match(
    deals,
    /ACTIVE_STATUSES = new Set\(\['accepted', 'in_progress', 'at_border', 'awaiting_confirmation', 'delivered'\]\)/,
  );
  assert.match(
    deals,
    /ARCHIVE_DEAL_STATUSES = new Set\(\['completed', 'cancelled', 'rejected', 'expired'\]\)/,
  );
  assert.doesNotMatch(
    deals,
    /ARCHIVE_DEAL_STATUSES = new Set\([^\n]*'delivered'/,
  );
});

test('shipper gets an explicit receipt-confirmation action for delivered deals', () => {
  assert.match(deals, /const needsReceiptConfirmation = role === 'client' && data\.status === 'delivered'/);
  assert.match(deals, /needsReceiptConfirmation\s*\? t\('confirm_delivery'\)/);
  assert.match(deals, /attentionRequired = needsReceiptConfirmation \|\| trackingActionRequired/);
});

test('delivered is not dimmed as archive; only terminal deal statuses are dimmed', () => {
  assert.match(deals, /dimmed=\{ARCHIVE_DEAL_STATUSES\.has\(data\.status\)\}/);
  assert.match(deals, /status === 'awaiting_confirmation' \|\| status === 'delivered'/);
  assert.match(deals, /status === 'completed'/);
});
