import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const deals = fs.readFileSync('src/screens/DealsScreen.js', 'utf8');

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
  // P1 theme-consistency (25.08.2026): WAITING was a hardcoded grey that
  // happened to equal theme.textMuted's light-mode hex exactly — it now
  // reads theme.textMuted at render time so Deals stays calm/neutral in
  // dark mode too, instead of freezing to the light value.
  assert.match(deals, /isCountered \? INFO : theme\.textMuted/);
  assert.doesNotMatch(deals, /name="dollar-sign"/);
});
