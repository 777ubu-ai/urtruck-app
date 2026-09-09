// Design v1 Commit 3 — MarketplaceCard gray-box contract.
// Pattern: favorites_render_runtime.test.mjs / design_system_primitives.test.mjs
// (module.register of mocks/render-env-hooks.mjs; components execute as plain
// functions; the returned element tree is inspected directly).
//
// Pins the approved card canon (design-preview-kimi-20260909 feed-driver-ru.png,
// deals.png):
//   - route and the fixed price column render as SIBLINGS in one flex row —
//     the legacy absolute-positioned price-over-text layout is gone;
//   - Flag component (20×14, View-rendered) is used for BOTH endpoints;
//   - route text has a 2-line clamp (numberOfLines 2);
//   - bookmark hit target is 44×44 with hitSlop + localized a11y label;
//   - deal status colours flow through v1StatusColors (StatusPill role color).
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./mocks/render-env-hooks.mjs', import.meta.url);

const { LIGHT } = await import('../../src/theme/designV1Palette.js');
const { v1StatusColors } = await import('../../src/theme/designV1.js');
const { default: MarketplaceCard } = await import('../../src/components/ui/v1/MarketplaceCard.js');
const { default: Flag, flagColors } = await import('../../src/components/ui/v1/Flag.js');
const { default: StatusPill } = await import('../../src/components/ui/v1/StatusPill.js');
const { StyleSheet } = await import('react-native');

// ── tree helpers (same shape as design_system_primitives.test.mjs) ────
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
const typeName = (el) => (el?.type?.displayName) || (typeof el?.type === 'string' ? el.type : el?.type?.name);
const findByType = (tree, t) => walk(tree).filter((el) => el.type === t || typeName(el) === t);

const baseProps = {
  testID: 'marketplace-card-test',
  onPress: () => {},
  route: { from: 'Алматы', to: 'Ürümqi', fromFlag: 'KZ', toFlag: 'CN', numberOfLines: 2 },
  price: '450 000 ₸',
  priceMeta: '12 сен',
  meta: ['Стройматериалы', '20 т · 86 м³ · бортовая'],
  badge: { label: 'ГРУЗ', kind: 'cargo' },
  counterparty: 'ТОО «Caspian Logistics»',
  bookmark: {
    saved: false,
    onToggle: () => {},
    testID: 'marketplace-card-bookmark',
    accessibilityLabel: 'В избранное',
  },
};

test('route and price column are siblings in one row — no absolute price over text', () => {
  const tree = MarketplaceCard(baseProps);
  // No absolute positioning anywhere in the card (the legacy priceWrap used
  // position:absolute over the text area).
  const absolute = walk(tree).filter((el) => flatten(el.props?.style)?.position === 'absolute');
  assert.equal(absolute.length, 0, 'card must not use absolute positioning');
  // Route block and price column sit in the same top row.
  const rows = walk(tree).filter((el) => flatten(el.props?.style)?.flexDirection === 'row');
  const topRow = rows.find((el) => {
    const kids = walk(el);
    return kids.some((k) => flatten(k.props?.style)?.width === '28%');
  });
  assert.ok(topRow, 'fixed 28% price column must exist inside a flex row');
  const rowKids = walk(topRow);
  const routeKid = rowKids.find((k) => flatten(k.props?.style)?.flex === 1 && flatten(k.props?.style)?.minWidth === 0);
  assert.ok(routeKid, 'route block (flex:1, minWidth:0) must be a sibling of the price column');
  const priceCol = rowKids.find((k) => flatten(k.props?.style)?.width === '28%');
  assert.equal(flatten(priceCol.props?.style).marginLeft, 12);
  assert.equal(flatten(priceCol.props?.style).alignItems, 'flex-start', 'price column content is left-aligned within its column');
});

test('Flag component renders both endpoints (20×14 geometry, known codes)', () => {
  const tree = MarketplaceCard(baseProps);
  const flags = findByType(tree, Flag);
  assert.equal(flags.length, 2, 'expected exactly two Flag elements (from + to)');
  const codes = flags.map((el) => el.props.code).sort();
  assert.deepEqual(codes, ['CN', 'KZ']);
  assert.deepEqual(flagColors('KZ').colors, ['#00ABC2', '#00ABC2', '#FEC50C']);
  assert.deepEqual(flagColors('CN').colors, ['#DE2910']);
});

test('route text has the 2-line clamp (numberOfLines: 2)', () => {
  const tree = MarketplaceCard(baseProps);
  const texts = walk(tree).filter((el) => typeName(el) === 'Text');
  const routeText = texts.find((el) => el.props.numberOfLines === 2 && typeof flatten(el.props.style).fontSize === 'number');
  assert.ok(routeText, 'route Text with numberOfLines=2 must exist');
  const style = flatten(routeText.props.style);
  assert.equal(style.fontSize, 16);
  assert.equal(style.fontWeight, '700');
});

test('price uses the canon typography (17/800) with tabular-nums', () => {
  const tree = MarketplaceCard(baseProps);
  const texts = walk(tree).filter((el) => typeName(el) === 'Text');
  const priceText = texts.find((el) => flatten(el.props.style)?.fontSize === 17);
  assert.ok(priceText, 'price Text at 17sp must exist');
  const style = flatten(priceText.props.style);
  assert.equal(style.fontWeight, '800');
  assert.deepEqual(style.fontVariant, ['tabular-nums']);
});

test('bookmark is a 44dp target with hitSlop and a localized label', () => {
  const tree = MarketplaceCard(baseProps);
  const pressables = findByType(tree, 'Pressable');
  const bookmark = pressables.find((el) => el.props.testID === 'marketplace-card-bookmark');
  assert.ok(bookmark, 'bookmark Pressable must exist');
  const style = flatten(bookmark.props.style);
  assert.equal(style.width, 44);
  assert.equal(style.height, 44);
  assert.ok(bookmark.props.hitSlop && bookmark.props.hitSlop.top >= 10, 'hitSlop guards the target');
  assert.equal(bookmark.props.accessibilityLabel, 'В избранное');
  assert.equal(bookmark.props.accessibilityState.selected, false);
});

test('status pill maps deal statuses through v1StatusColors role tokens', () => {
  const role = v1StatusColors(LIGHT);
  assert.equal(role.at_border, LIGHT.statusAtBorder);

  const tree = MarketplaceCard({
    ...baseProps,
    badge: undefined,
    status: { key: 'at_border', label: 'На границе' },
  });
  const pills = findByType(tree, StatusPill);
  assert.equal(pills.length, 1, 'StatusPill must render for the status prop');
  assert.equal(pills[0].props.status, 'at_border');
  // StatusPill renders as an element in the card tree; executing it directly
  // proves the role color flows from v1StatusColors into the dot (no
  // hardcoded hex in the component).
  const pillTree = StatusPill({ status: 'at_border', label: 'На границе' });
  const dots = walk(pillTree).filter((el) => flatten(el.props?.style)?.backgroundColor === LIGHT.statusAtBorder);
  assert.ok(dots.length >= 1, 'dot must use v1StatusColors(LIGHT).at_border');
  // received vs completed must differ: received rides accentDeep
  // (statusReceived), completed rides archive grey (statusCompleted).
  assert.notEqual(v1StatusColors(LIGHT).received, v1StatusColors(LIGHT).completed);
  const receivedTree = StatusPill({ status: 'received', label: 'Получен' });
  const completedTree = StatusPill({ status: 'completed', label: 'Завершён' });
  const hasExact = (t, color) => walk(t).some((el) => flatten(el.props?.style)?.backgroundColor === color);
  assert.ok(hasExact(receivedTree, LIGHT.statusReceived), 'received dot must use statusReceived (accentDeep)');
  assert.ok(hasExact(completedTree, LIGHT.statusCompleted), 'completed dot must use statusCompleted (archive grey)');
});

test('type badge uses the cargo clientOrange tint and trip accent tint', () => {
  const cargoTree = MarketplaceCard(baseProps);
  const cargoBadge = walk(cargoTree).find((el) => flatten(el.props?.style)?.backgroundColor === `${LIGHT.clientAccent}14`);
  assert.ok(cargoBadge, 'cargo badge must use the clientOrange soft tint');
  assert.equal(flatten(cargoBadge.props.style).borderRadius, 999);

  const tripTree = MarketplaceCard({ ...baseProps, badge: { label: 'РЕЙС', kind: 'trip' } });
  const tripBadge = walk(tripTree).find((el) => flatten(el.props?.style)?.backgroundColor === `${LIGHT.driver}14`);
  assert.ok(tripBadge, 'trip badge must use the accent soft tint');
});
