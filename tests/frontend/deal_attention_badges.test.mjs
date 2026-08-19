import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const deals = fs.readFileSync('src/screens/DealsScreen.js', 'utf8');

test('deal inbox preserves actionable counters for offers and active deals', () => {
  assert.match(deals, /const offerAttentionCount = useMemo/);
  assert.match(deals, /offersData\.reduce/);
  assert.match(deals, /const activeAttentionCount = useMemo/);
  assert.match(deals, /activeDeals\.reduce/);
  assert.match(deals, /tracking_action_required \? 1 : 0/);
});

test('attention inside cards uses the distinct red unread badge', () => {
  assert.match(deals, /testID="deals-card-unread"/);
  assert.match(deals, /backgroundColor: '#D64545'/);
});

test('waiting offer cards use calm neutral colours', () => {
  assert.match(deals, /const WAITING = '#617067'/);
  assert.match(deals, /isCountered \? INFO : WAITING/);
  assert.doesNotMatch(deals, /name="dollar-sign"/);
});
