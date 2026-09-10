// MarketplaceCard — shared compact list card for cargoes, trips, saved
// listings and deal adapters. It owns layout only: callers keep API/state.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import Card from './Card';
import RouteLine from './RouteLine';
import BookmarkButton from './BookmarkButton';
import StatusPill from './StatusPill';
import { useV1Colors, useV1Typography } from '../../../theme/designV1';

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
}) {
  const colors = useV1Colors();
  const typo = useV1Typography();
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
      style={[s.card, dimmed && s.dimmed, style]}
    >
      <View style={s.topRow}>
        {structured ? (
          <RouteLine
            from={routeMeta.from}
            to={routeMeta.to}
            fromFlag={routeMeta.fromFlag}
            toFlag={routeMeta.toFlag}
            numberOfLines={routeMeta.numberOfLines || 1}
            testID={routeMeta.testID}
          />
        ) : (
          <Text style={[s.routeText, { color: colors.text }]} numberOfLines={1}>{routeLabel || '—'}</Text>
        )}
        {price ? (
          <View style={s.priceColumn}>
            <Text style={[typo.price, s.price, { color: colors.driver }]} numberOfLines={1} testID={priceTestID}>{price}</Text>
            {priceMeta ? <Text style={[s.priceMeta, { color: colors.textMuted }]} numberOfLines={1}>{priceMeta}</Text> : null}
          </View>
        ) : null}
        {chevron ? <Feather name="chevron-right" size={18} color={colors.textDim} style={s.chevron} /> : null}
      </View>

      {firstMeta ? <Text style={[s.meta, { color: colors.textMuted }]} numberOfLines={1}>{firstMeta}</Text> : null}
      {body || status || rightMeta || bookmark || unread > 0 ? (
        <View style={s.bottomRow}>
          <View style={s.bottomText}>
            {body ? <Text style={[s.description, { color: colors.textMuted }]} numberOfLines={1}>{body}</Text> : null}
            {status ? <StatusPill status={status.key} label={status.label} color={status.color} testID={status.testID} /> : null}
          </View>
          {rightMeta ? <Text style={[s.rightMeta, { color: colors.textDim }]} numberOfLines={1}>{rightMeta}</Text> : null}
          {unread > 0 ? <View style={[s.unread, { backgroundColor: colors.error }]} testID="deals-card-unread"><Text style={s.unreadText}>{unread > 9 ? '9+' : unread}</Text></View> : null}
          {bookmark ? <BookmarkButton saved={bookmark.saved} onPress={bookmark.onToggle} testID={bookmark.testID} accessibilityLabel={bookmark.accessibilityLabel} /> : null}
        </View>
      ) : null}
      {children}
    </Card>
  );
}

const s = StyleSheet.create({
  card: { padding: 12, minHeight: 108 },
  dimmed: { opacity: 0.62 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', minWidth: 0 },
  routeText: { flex: 1, minWidth: 0, fontSize: 16, lineHeight: 20, fontWeight: '700', letterSpacing: -0.15 },
  priceColumn: { width: PRICE_COLUMN_WIDTH, marginLeft: 8, alignItems: 'flex-end', flexShrink: 0 },
  price: { textAlign: 'right', fontVariant: ['tabular-nums'], letterSpacing: -0.1 },
  priceMeta: { fontSize: 12, lineHeight: 16, fontWeight: '600', marginTop: 1, textAlign: 'right' },
  chevron: { marginLeft: 4, marginTop: 1, flexShrink: 0 },
  meta: { marginTop: 6, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  bottomRow: { flexDirection: 'row', alignItems: 'center', minHeight: 40, marginTop: 2, gap: 8 },
  bottomText: { flex: 1, minWidth: 0, justifyContent: 'center' },
  description: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  rightMeta: { fontSize: 12, lineHeight: 16, fontWeight: '600', flexShrink: 0 },
  unread: { minWidth: 19, height: 19, paddingHorizontal: 5, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  unreadText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
});
