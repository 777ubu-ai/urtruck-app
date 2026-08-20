import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const deals = fs.readFileSync('src/screens/DealsScreen.js', 'utf8');

test('delivered and received remain active until final completed', () => {
  assert.match(deals, /ACTIVE_STATUSES = new Set\(\['accepted', 'in_progress', 'at_border', 'awaiting_confirmation', 'delivered', 'received'\]\)/);
  assert.match(deals, /ARCHIVE_DEAL_STATUSES = new Set\(\['completed', 'cancelled', 'rejected', 'expired'\]\)/);
  assert.doesNotMatch(deals, /ARCHIVE_DEAL_STATUSES = new Set\([^\n]*'delivered'/);
  assert.doesNotMatch(deals, /ARCHIVE_DEAL_STATUSES = new Set\([^\n]*'received'/);
});

test('shipper gets receipt attention only while delivered or legacy awaiting confirmation', () => {
  assert.match(deals, /needsReceiptConfirmation = role === 'client' && \(data\.status === 'delivered' \|\| data\.status === 'awaiting_confirmation'\)/);
  assert.match(deals, /needsReceiptConfirmation\s*\? t\('confirm_delivery'\)/);
  assert.match(deals, /attentionRequired = needsReceiptConfirmation \|\| trackingActionRequired/);
});

test('received and completed have distinct visual labels', () => {
  assert.match(deals, /status === 'received'[\s\S]*status_received/);
  assert.match(deals, /status === 'completed'[\s\S]*status_completed/);
});
