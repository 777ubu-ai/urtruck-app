import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src=readFileSync('src/screens/DealWorkspaceScreenV2.js','utf8');

test('Deal Workspace keeps Back/header outside the scrolling FlatList',()=>{
  const chat=src.slice(src.indexOf('testID="deal-chat-fullscreen"'), src.indexOf('{recording ?'));
  const headerPos=chat.indexOf('{compactHeader}');
  const listPos=chat.indexOf('<FlatList');
  assert.ok(headerPos>=0 && listPos>headerPos, 'fixed header must precede message FlatList');
  assert.doesNotMatch(chat,/ListHeaderComponent=\{compactHeader\}/);
  assert.match(src,/testID="deal-workspace-back"/);
});
