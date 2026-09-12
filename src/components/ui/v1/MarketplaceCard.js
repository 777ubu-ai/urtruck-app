// MarketplaceCard — shared compact list card for cargoes, trips, saved
// listings and deal adapters. It owns layout only: callers keep API/state.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import Card from './Card';
import RouteLine from './RouteLine';
import BookmarkButton from './BookmarkButton';
import StatusPill from './StatusPill';
import { useV1Colors, useDriverCeramicColors, useV1Typography } from '../../../theme/designV1';

// 108dp protects a complete price/currency; the route renderer owns the
// complementary compact type scale for 390dp phones.
const PRICE_COLUMN_WIDTH = 108;

export default function MarketplaceCard({
  testID,
  accessibilityLabel,
  onPress,
  style,
  route,
  price,
  priceTestID,
  priceMeta,
  meta = [],
  description,
  // `badge` is retained only for old callers. Marketplace cards deliberately
  // never render it: labels such as «ГРУЗ» duplicate the list context.
  badge: _badge,
  status,
  counterparty,
  rightMeta,
  unread = 0,
  chevron = false,
  dimmed = false,
  bookmark,
  children,
  variant = 'default',
  compact = false,
}) {
  const baseColors = useV1Colors();
  const ceramic = useDriverCeramicColors();
  const typo = useV1Typography();
  const colors = variant === 'driver' ? ceramic : baseColors;
  const palette = colors;
  const structured = route && typeof route === 'object';
  const routeLabel = structured ? null : route;
  const routeMeta = structured ? route : {};
  const cleanMeta = meta.filter(Boolean);
  const firstMeta = cleanMeta[0];
  const body = description || cleanMeta.slice(1).join(' · ') || counterparty;

  return (
    <Card
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={[compact ? s.compactCard : s.card, dimmed && s.dimmed, style]}
      ceramic={variant === 'driver' || variant === 'shipper'}
    >
      <View style={[s.topRow, compact && s.compactTopRow]}>
        {structured ? (
          <RouteLine
            from={routeMeta.from}
            to={routeMeta.to}
            fromFlag={routeMeta.fromFlag}
            toFlag={routeMeta.toFlag}
            numberOfLines={compact ? 1 : (routeMeta.numberOfLines || 1)}
            compact={compact}
            testID={routeMeta.testID}
            ceramic={variant === 'driver'}
          />
        ) : (
      <Text style={[s.routeText, { color: palette.text }]} numberOfLines={1}>{routeLabel || '—'}</Text>
        )}
        {price ? (
          <View style={[s.priceColumn, compact && s.compactPriceColumn]}>
            <Text style={[typo.price, s.price, compact && s.compactPrice, { color: palette.text }]} numberOfLines={1} testID={priceTestID}>{price}</Text>
            {priceMeta ? <Text style={[s.priceMeta, compact && s.compactPriceMeta, { color: palette.textMuted }]} numberOfLines={1}>{priceMeta}</Text> : null}
          </View>
        ) : null}
        {chevron ? <Feather name="chevron-right" size={18} color={colors.textDim} style={s.chevron} /> : null}
      </View>

      {firstMeta ? <Text style={[s.meta, compact && s.compactMeta, { color: palette.textMuted }]} numberOfLines={1}>{firstMeta}</Text> : null}
      {body || status || rightMeta || bookmark || unread > 0 ? (
        <View style={[s.bottomRow, compact && s.compactBottomRow]}>
          <View style={s.bottomText}>
            {body && !compact ? <Text style={[s.description, { color: palette.textMuted }]} numberOfLines={1}>{body}</Text> : null}
            {status ? <StatusPill status={status.key} label={status.label} color={status.color} testID={status.testID} /> : null}
          </View>
          {rightMeta ? <Text style={[s.rightMeta, { color: palette.textMuted }]} numberOfLines={1}>{rightMeta}</Text> : null}
            {unread > 0 ? <View style={[s.unread, { backgroundColor: colors.error }]} testID="deals-card-unread"><Text style={s.unreadText}>{unread > 9 ? '9+' : unread}</Text></View> : null}
          {bookmark ? <BookmarkButton compact={compact} saved={bookmark.saved} onPress={bookmark.onToggle} testID={bookmark.testID} accessibilityLabel={bookmark.accessibilityLabel} /> : null}
        </View>
      ) : null}
      {children}
    </Card>
  );
}

const s = StyleSheet.create({
  card: { padding: 12, minHeight: 108, borderRadius: 15 },
  // Marketplace feed canon: three dense rows at 390dp. The normal card is
  // retained for detail/deal adapters that intentionally contain actions.
  compactCard: { padding: 0, minHeight: 60, height: 60, borderRadius: 14 },
  dimmed: { opacity: 0.62 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', minWidth: 0 },
  compactTopRow: { minHeight: 17 },
  routeText: { flex: 1, minWidth: 0, fontSize: 16, lineHeight: 20, fontWeight: '700', letterSpacing: -0.15 },
  priceColumn: { width: PRICE_COLUMN_WIDTH, marginLeft: 8, alignItems: 'flex-end', flexShrink: 0 },
  compactPriceColumn: { width: 96, marginLeft: 5 },
  price: { textAlign: 'right', fontVariant: ['tabular-nums'], letterSpacing: -0.1 },
  compactPrice: { fontSize: 14, lineHeight: 16, fontWeight: '800' },
  priceMeta: { fontSize: 12, lineHeight: 16, fontWeight: '600', marginTop: 1, textAlign: 'right' },
  compactPriceMeta: { fontSize: 10, lineHeight: 12 },
  chevron: { marginLeft: 4, marginTop: 1, flexShrink: 0 },
  meta: { marginTop: 6, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  compactMeta: { marginTop: 0, fontSize: 10, lineHeight: 12, fontWeight: '600' },
  bottomRow: { flexDirection: 'row', alignItems: 'center', minHeight: 40, marginTop: 2, gap: 8 },
  compactBottomRow: { minHeight: 20, marginTop: 0, gap: 5 },
  bottomText: { flex: 1, minWidth: 0, justifyContent: 'center' },
  description: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  compactDescription: { fontSize: 11, lineHeight: 14, fontWeight: '500' },
  rightMeta: { fontSize: 12, lineHeight: 16, fontWeight: '600', flexShrink: 0 },
  unread: { minWidth: 19, height: 19, paddingHorizontal: 5, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  unreadText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
});
