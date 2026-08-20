import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const nav = fs.readFileSync('src/navigation/AppNavigator.js', 'utf8');
const bottom = fs.readFileSync('src/components/ui/v1/BottomNav.js', 'utf8');
const resolver = fs.readFileSync('src/utils/dealActionResolver.js', 'utf8');
const workspace = fs.readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');
const trip = fs.readFileSync('src/screens/TripDetailV2.js', 'utf8');
const cargo = fs.readFileSync('src/screens/CargoDetailV2.js', 'utf8');
const feed = fs.readFileSync('src/screens/CargoFeedScreen.js', 'utf8');
const backend = fs.readFileSync('backend/api/marketplace.py', 'utf8');

test('main tabs are four canonical tabs for both roles and Queue is not a bottom tab', () => {
  const start = nav.indexOf('function MainTabs');
  const end = nav.indexOf('// Реактивная навигация', start);
  const tabs = nav.slice(start, end);
  assert.doesNotMatch(tabs, /Tab\.Screen name="Queue"/);
  assert.equal((tabs.match(/Tab\.Screen name="Deals"/g) || []).length, 2);
  assert.equal((tabs.match(/Tab\.Screen name="Profile"/g) || []).length, 2);
  assert.match(bottom, /Profile: \{ driver: 'user', client: 'user' \}/);
  assert.doesNotMatch(bottom, /Queue:\s*\{/);
  assert.doesNotMatch(bottom, /route\.name === 'Publish'/);
});

test('shared resolver enforces driver and shipper actions including explicit received', () => {
  assert.match(resolver, /isDriver/);
  assert.match(resolver, /key: 'in_progress'/);
  assert.match(resolver, /key: 'at_border'/);
  assert.match(resolver, /key: 'delivered'/);
  assert.match(resolver, /isShipper && current === 'delivered'[\s\S]*key: 'received'/);
  assert.match(resolver, /isShipper && current === 'received'[\s\S]*key: 'completed'/);
});

test('workspace and detail routers keep received in the active deal experience', () => {
  assert.match(workspace, /getAvailableDealActions/);
  assert.match(workspace, /tripAwaitingReceipt/);
  assert.match(workspace, /tripReceived/);
  assert.match(trip, /'delivered', 'received'/);
  assert.match(cargo, /'delivered', 'received'/);
});

test('driver save UI uses bookmark consistently', () => {
  assert.match(feed, /cargo-filter-favorites/);
  assert.match(feed, /name="bookmark"/);
  assert.doesNotMatch(feed, /<Feather name="star"/);
});

test('backend cannot skip received and cargo completes only with completed deal', () => {
  assert.match(backend, /"delivered":\s*\{"received"\}/);
  assert.match(backend, /"received":\s*\{"completed"\}/);
  assert.doesNotMatch(backend, /\("delivered", "completed"\)/);
  assert.match(backend, /if new_status == "completed" and deal\.get\("cargo_id"\)/);
  assert.match(backend, /VALID = \["accepted", "in_progress", "at_border", "delivered", "received", "completed", "cancelled"\]/);
});
