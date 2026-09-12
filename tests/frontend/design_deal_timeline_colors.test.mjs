// Design v1 Commit 4 — DealStatusTimeline status→color contract.
// Gray-box: the timeline renders as a plain element tree (hooks stubbed via
// mocks/render-env-hooks.mjs + mocks/timeline-env-hooks.mjs, the latter
// swaps the DealRoom import for a stub — the real one pulls native TruckMap).
//
// Pins:
//   - every deal status (accepted / in_progress / at_border / delivered /
//     received / completed / cancelled) colors its dot + icon through
//     v1StatusColors role tokens — no hardcoded hex remains in the file;
//   - received vs completed differ BOTH by icon (check-square vs flag) AND
//     by color (accentDeep statusReceived vs archive-grey statusCompleted);
//   - the newest-first history-feed semantics and the latest-event
//     highlight card are untouched (FSM semantics out of scope by design).
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import fs from 'node:fs';

register('./mocks/render-env-hooks.mjs', import.meta.url);
register('./mocks/timeline-env-hooks.mjs', import.meta.url);

const { LIGHT } = await import('../../src/theme/designV1Palette.js');
const { v1StatusColors } = await import('../../src/theme/designV1.js');
const { default: DealStatusTimeline } = await import('../../src/components/deal/DealStatusTimeline.js');
const { StyleSheet } = await import('react-native');

const flatten = (style) => StyleSheet.flatten(style) || {};
const walk = (node, out = []) => {
  if (node == null) return out;
  if (Array.isArray(node)) { node.forEach((n) => walk(n, out)); return out; }
  if (typeof node !== 'object') return out;
  out.push(node);
  const kids = node.children ?? node.props?.children ?? [];
  walk(Array.isArray(kids) ? kids : [kids], out);
  return out;
};

const event = (status, id, createdAt) => ({
  id,
  payload: { status },
  created_at: createdAt,
});

const renderStatuses = (statuses) => DealStatusTimeline({
  events: statuses.map((status, i) => event(status, i + 1, `2026-09-0${i + 1}T08:05:00Z`)),
  fallbackStatus: '',
});

// Все цвета иконок/точек в дереве (props.color у stub-глифов Feather).
const iconColors = (tree) => walk(tree)
  .map((el) => el.props?.color)
  .filter((c) => typeof c === 'string' && /^#|^rgba/.test(c));

test('no hardcoded hexes remain in DealStatusTimeline (tokens only)', () => {
  const src = fs.readFileSync('src/components/deal/DealStatusTimeline.js', 'utf8');
  assert.doesNotMatch(src, /#[0-9A-Fa-f]{6}/, 'timeline must read colours from v1 tokens');
});

test('every deal status colors its dot and icon via v1StatusColors roles', () => {
  const roles = v1StatusColors(LIGHT);
  const statuses = ['accepted', 'in_progress', 'at_border', 'delivered', 'received', 'completed', 'cancelled'];
  const tree = renderStatuses(statuses);
  const colors = iconColors(tree);
  for (const st of statuses) {
    assert.ok(colors.includes(roles[st]), `${st}: expected role color ${roles[st]} among icon/dot colors`);
  }
  // at_border must ride its own amber role, not the old flat green.
  assert.ok(colors.includes(LIGHT.statusAtBorder));
  assert.equal(colors.filter((c) => c === LIGHT.statusAccepted).length, 1, 'only accepted events are green');
});

test('received vs completed differ both by icon and by color', () => {
  const roles = v1StatusColors(LIGHT);
  assert.notEqual(roles.received, roles.completed, 'received accentDeep vs completed archive grey');
  assert.equal(roles.received, LIGHT.statusReceived);
  assert.equal(roles.completed, LIGHT.statusCompleted);

  const src = fs.readFileSync('src/components/deal/DealStatusTimeline.js', 'utf8');
  assert.match(src, /received: 'check-square'/);
  assert.match(src, /completed: 'flag'/);

  const tree = renderStatuses(['received', 'completed']);
  const colors = iconColors(tree);
  assert.ok(colors.includes(roles.received), 'received event must use statusReceived color');
  assert.ok(colors.includes(roles.completed), 'completed event must use statusCompleted color');
});

test('history feed semantics unchanged: newest first, latest-event highlight kept', () => {
  const src = fs.readFileSync('src/components/deal/DealStatusTimeline.js', 'utf8');
  assert.match(src, /return eventTime\(b\) - eventTime\(a\)/, 'newest-first sort preserved');
  assert.match(src, /currentCard/, 'latest-event highlight card preserved');
  const roles = v1StatusColors(LIGHT);
  const tree = DealStatusTimeline({
    events: [event('completed', 1, '2026-09-01T08:05:00Z'), event('accepted', 2, '2026-09-05T08:05:00Z')],
    fallbackStatus: '',
  });
  // Newest (accepted) is first and carries the highlight card tint.
  const highlighted = walk(tree).filter((el) => flatten(el.props?.style)?.backgroundColor === LIGHT.driverSoft);
  assert.equal(highlighted.length, 1, 'exactly one highlighted (latest) event card');
});
