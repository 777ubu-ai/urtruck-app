// Утверждённое владельцем оформление истории: один зелёный акцент (17.10.2026).
// Gray-box: the timeline renders as a plain element tree (hooks stubbed via
// mocks/render-env-hooks.mjs + mocks/timeline-env-hooks.mjs, the latter
// swaps the DealRoom import for a stub — the real one pulls native TruckMap).
//
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import fs from 'node:fs';

register('./mocks/render-env-hooks.mjs', import.meta.url);
register('./mocks/timeline-env-hooks.mjs', import.meta.url);

const { LIGHT } = await import('../../src/theme/designV1Palette.js');
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

test('история использует один зелёный акцент для всех этапов, без светофора', () => {
  const statuses = ['accepted', 'in_progress', 'at_border', 'delivered', 'received', 'completed', 'cancelled'];
  const tree = renderStatuses(statuses);
  const colors = iconColors(tree);
  assert.equal(colors.length, statuses.length);
  assert.ok(colors.every(color => color === LIGHT.success || color === LIGHT.surface));
  assert.equal(colors.filter(color => color === LIGHT.surface).length, 1, 'только последнее событие имеет залитый значок');
});

test('получение и завершение различаются подписью и иконкой, а не случайным цветом', () => {
  const tree = renderStatuses(['received', 'completed']);
  const names = walk(tree).map(node => node.props?.name).filter(Boolean);
  assert.ok(names.includes('check-square'));
  assert.ok(names.includes('flag'));
  const texts = walk(tree).flatMap(node => node.children || []).filter(value => typeof value === 'string');
  assert.ok(texts.includes('event:received'));
  assert.ok(texts.includes('event:completed'));
});

test('history feed semantics unchanged: newest first, latest-event highlight kept', () => {
  const src = fs.readFileSync('src/components/deal/DealStatusTimeline.js', 'utf8');
  assert.match(src, /return eventTime\(b\) - eventTime\(a\)/, 'newest-first sort preserved');
  assert.match(src, /currentCard/, 'latest-event highlight card preserved');
  const tree = DealStatusTimeline({
    events: [event('completed', 1, '2026-09-01T08:05:00Z'), event('accepted', 2, '2026-09-05T08:05:00Z')],
    fallbackStatus: '',
  });
  // Newest (accepted) is first and carries the highlight card tint.
  const highlighted = walk(tree).filter((el) => flatten(el.props?.style)?.backgroundColor === LIGHT.driverSoft);
  assert.equal(highlighted.length, 1, 'exactly one highlighted (latest) event card');
});
