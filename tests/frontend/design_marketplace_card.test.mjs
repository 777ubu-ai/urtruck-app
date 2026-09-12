// Unified marketplace list contract: one compact card / route / bookmark system.
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./mocks/render-env-hooks.mjs', import.meta.url);

const { default: MarketplaceCard } = await import('../../src/components/ui/v1/MarketplaceCard.js');
const { default: RouteLine } = await import('../../src/components/ui/v1/RouteLine.js');
const { default: BookmarkButton } = await import('../../src/components/ui/v1/BookmarkButton.js');
const { countryFlagXml } = await import('../../src/components/ui/v1/CountryFlag.js');
const { StyleSheet } = await import('react-native');

const flatten = (style) => StyleSheet.flatten(style) || {};
const walk = (node, out = []) => {
  if (node == null || typeof node !== 'object') return out;
  if (Array.isArray(node)) { node.forEach((item) => walk(item, out)); return out; }
  out.push(node);
  const kids = node.children ?? node.props?.children ?? [];
  walk(Array.isArray(kids) ? kids : [kids], out);
  return out;
};
const typeName = (el) => (el?.type?.displayName) || (typeof el?.type === 'string' ? el.type : el?.type?.name);

const baseProps = {
  testID: 'marketplace-card-test',
  onPress: () => {},
  route: { from: 'Санкт-Петербург', to: 'Усть-Каменогорск', fromFlag: 'RU', toFlag: 'KZ', numberOfLines: 1 },
  price: '450 000 USD',
  priceMeta: '12 сен',
  meta: ['Тент · 20 т · 86 м³'],
  description: 'Стройматериалы в коробках',
  compact: true,
  bookmark: { saved: false, onToggle: () => {}, testID: 'marketplace-card-bookmark', accessibilityLabel: 'В избранное' },
};

test('compact card keeps route and right-aligned price as siblings without absolute layout', () => {
  const tree = MarketplaceCard(baseProps);
  const absolute = walk(tree).filter((el) => flatten(el.props?.style).position === 'absolute');
  assert.equal(absolute.length, 0);
  const priceColumn = walk(tree).find((el) => flatten(el.props?.style).width === 96);
  assert.ok(priceColumn, 'fixed right price rail exists');
  assert.equal(flatten(priceColumn.props.style).alignItems, 'flex-end');
  const card = walk(tree).find((el) => flatten(el.props?.style).minHeight === 74);
  assert.ok(card, 'compact render branch uses the readable 74dp card');
});

test('route passes both ISO endpoints to shared CountryFlag renderer', () => {
  const tree = MarketplaceCard(baseProps);
  const route = walk(tree).find((el) => el.type === RouteLine);
  assert.ok(route);
  assert.equal(route.props.fromFlag, 'RU');
  assert.equal(route.props.toFlag, 'KZ');
  assert.ok(countryFlagXml(route.props.fromFlag));
  assert.ok(countryFlagXml(route.props.toFlag));
  assert.match(countryFlagXml('KZ'), /#00AFCA/i);
});

test('cargo type label is deliberately not rendered and bookmark remains a separate control', () => {
  const tree = MarketplaceCard({ ...baseProps, badge: { label: 'ГРУЗ', kind: 'cargo' } });
  const texts = walk(tree).filter((el) => typeName(el) === 'Text').flatMap((el) => el.children || el.props?.children || []);
  assert.equal(texts.includes('ГРУЗ'), false);
  const bookmark = walk(tree).find((el) => el.type === BookmarkButton);
  assert.ok(bookmark);
  assert.equal(bookmark.props.testID, 'marketplace-card-bookmark');
});
