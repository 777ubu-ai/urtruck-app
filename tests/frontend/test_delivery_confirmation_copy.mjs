import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Release guard: delivered is an active waiting-for-shipper state, not completion.
const workspace = fs.readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');
const deals = fs.readFileSync('src/screens/DealsScreen.js', 'utf8');
const i18n = fs.readFileSync('src/utils/i18n.js', 'utf8');

test('delivered screen is clearly waiting for shipper confirmation', () => {
  assert.match(workspace, /awaitingReceiptStatus: 'Ожидает подтверждения'/);
  assert.match(workspace, /tripDelivered: 'Груз доставлен'/);
  assert.match(workspace, /tripAwaitingReceipt: 'Ожидаем подтверждения грузоотправителя'/);
  assert.match(workspace, /Водитель отметил груз как доставленный\. Сделка завершится после подтверждения получения\./);
  assert.match(workspace, /visibleDealStatus === 'delivered' \? ui\.awaitingReceiptStatus/);
});

test('deal list uses awaiting confirmation, not terminal completion, for delivered', () => {
  assert.match(deals, /status_awaiting_receipt/);
  assert.match(i18n, /status_awaiting_receipt: 'Ожидает подтверждения'/);
});