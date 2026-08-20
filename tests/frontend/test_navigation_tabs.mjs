import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const navigator = fs.readFileSync('src/navigation/AppNavigator.js', 'utf8');
const bottomNav = fs.readFileSync('src/components/ui/v1/BottomNav.js', 'utf8');
const start = navigator.indexOf('function MainTabs');
const end = navigator.indexOf('// Реактивная навигация', start);
assert.ok(start >= 0 && end > start, 'MainTabs source must be discoverable');
const tabs = navigator.slice(start, end);
const countTab = (name) => tabs.split(`<Tab.Screen name="${name}"`).length - 1;

test('approved four-tab role navigation', () => {
  assert.equal(countTab('Queue'), 0);
  assert.equal(countTab('Publish'), 0);
  assert.equal(countTab('Chats'), 0);
  assert.equal(countTab('Feed'), 2);
  assert.equal(countTab('MyWork'), 2);
  assert.equal(countTab('Deals'), 2);
  assert.equal(countTab('Profile'), 2);
});

test('BottomNav has Profile and no obsolete tab branches', () => {
  assert.ok(bottomNav.includes("Profile: { driver: 'user', client: 'user' }"));
  assert.ok(!bottomNav.includes('Queue: {'));
  assert.ok(!bottomNav.includes('Chats: {'));
  assert.ok(!bottomNav.includes("route.name === 'Publish'"));
});

test('Queue remains a stack-only border tool', () => {
  assert.ok(!tabs.includes('<Tab.Screen name="Queue"'));
  assert.ok(navigator.includes('<Stack.Screen name="Queue" component={QueueScreen}'));
});
