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

test('approved four-tab role navigation restores Border and removes Profile', () => {
  assert.equal(countTab('Queue'), 2);
  assert.equal(countTab('Publish'), 0);
  assert.equal(countTab('Chats'), 0);
  assert.equal(countTab('Feed'), 2);
  assert.equal(countTab('MyWork'), 2);
  assert.equal(countTab('Deals'), 2);
  assert.equal(countTab('Profile'), 0);
});

test('BottomNav exposes Border and has no Profile tab branch', () => {
  assert.ok(bottomNav.includes("Queue:   { driver: 'map-pin', client: 'map-pin' }"));
  assert.ok(bottomNav.includes("if (name === 'Queue')   return t('tab_border')"));
  assert.ok(!bottomNav.includes("Profile: { driver: 'user', client: 'user' }"));
  assert.ok(!bottomNav.includes("if (name === 'Profile') return t('tab_profile')"));
  assert.ok(!bottomNav.includes("route.name === 'Publish'"));
});

test('Profile remains stack-accessible from the top menu', () => {
  assert.ok(navigator.includes('<Stack.Screen name="Profile" component={ProfileScreen}'));
});
