import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const deals = fs.readFileSync('src/screens/DealsScreen.js', 'utf8');
const cargoDetail = fs.readFileSync('src/screens/CargoDetail.js', 'utf8');
const tripDetail = fs.readFileSync('src/screens/TripDetail.js', 'utf8');

test('deal inbox preserves actionable counters for offers and active deals', () => {
  assert.match(deals, /const offerAttentionCount = useMemo/);
  assert.match(deals, /offersData\.reduce/);
  assert.match(deals, /const activeAttentionCount = useMemo/);
  assert.match(deals, /activeDeals\.reduce/);
  assert.match(
    deals,
    /item\.tracking_action_required \|\| \(role === 'client' && \(item\.status === 'delivered' \|\| item\.status === 'awaiting_confirmation'\)\)/,
  );
});

test('attention inside cards uses the distinct red unread badge', () => {
  assert.match(deals, /testID="deals-card-unread"/);
  assert.match(deals, /backgroundColor: '#D64545'/);
  assert.match(deals, /const needsReceiptConfirmation = role === 'client' && \(data\.status === 'delivered' \|\| data\.status === 'awaiting_confirmation'\)/);
  assert.match(deals, /const attentionRequired = needsReceiptConfirmation \|\| trackingActionRequired/);
});

test('waiting offer cards use calm neutral colours', () => {
  assert.match(deals, /const WAITING = '#617067'/);
  assert.match(deals, /isCountered \? INFO : WAITING/);
  assert.doesNotMatch(deals, /name="dollar-sign"/);
});

test('deal top tabs fit narrow phones and show counts as badges', () => {
  assert.match(deals, /styles\.tabCountBadge/);
  assert.match(deals, /count > 99 \? '99\+' : count/);
  assert.match(deals, /tabOffersLabel: 'Предложения'/);
  assert.match(deals, /tabActiveLabel: 'В работе'/);
  assert.match(deals, /tabArchiveLabel: 'Архив'/);
  assert.match(deals, /label=\{copy\.tabOffersLabel\}/);
  assert.match(deals, /label=\{copy\.tabActiveLabel\}/);
  assert.match(deals, /styles\.tabChipLabelRow/);
  assert.match(deals, /flexDirection:\s*'column'/);
  assert.match(deals, /adjustsFontSizeToFit/);
  assert.match(deals, /minimumFontScale=\{0\.62\}/);
  assert.match(deals, /tabChip:\s*\{[\s\S]*flex:\s*1/);
  assert.match(deals, /tabChipText:\s*\{[\s\S]*fontSize:\s*11/);
  assert.match(deals, /tabChipText:\s*\{[\s\S]*flexGrow:\s*1/);
});

test('existing bid action names the edited price, not a vague edit action', () => {
  assert.match(cargoDetail, /const editBidLabel = \(\{/);
  assert.match(tripDetail, /const editBidLabel = \(\{/);
  assert.match(cargoDetail, /RU:\s*'Изменить цену'/);
  assert.match(tripDetail, /RU:\s*'Изменить цену'/);
  assert.match(cargoDetail, /label=\{editBidLabel\}/);
  assert.match(tripDetail, /label=\{editBidLabel\}/);
});
