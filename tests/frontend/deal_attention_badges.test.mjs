import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const list = fs.readFileSync('src/screens/ChatsListScreen.js', 'utf8');
const tabs = fs.readFileSync('src/components/ui/v1/SegmentTabs.js', 'utf8');

test('top deal sections expose actionable counters', () => {
  assert.match(list, /attentionCount: offersData\.reduce/);
  assert.match(list, /attentionCount: activeDeals\.reduce/);
  assert.match(list, /tracking_action_required \? 1 : 0/);
});

test('attention uses a distinct notification badge', () => {
  assert.match(tabs, /attentionBadge/);
  assert.match(tabs, /#D64545/);
  assert.match(tabs, /-attention/);
});

test('waiting offer cards use calm neutral colours', () => {
  assert.match(list, /isCountered \? '#3478D4' : '#617067'/);
  assert.match(list, /backgroundColor: '#F0F3F1'/);
});
