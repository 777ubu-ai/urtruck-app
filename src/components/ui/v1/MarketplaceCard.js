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

// The fixed price rail keeps amounts/dates readable without pushing the route
// onto a second line on compact phones.
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
      style={[s.card, dimmed && s.dimmed, style]}
      ceramic={variant === 'driver'}
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
            ceramic={variant === 'driver'}
          />
        ) : (
      <Text style={[s.routeText, { color: palette.text }]} numberOfLines={1}>{routeLabel || '—'}</Text>
        )}
        {price ? (
          <View style={s.priceColumn}>
            <Text style={[typo.price, s.price, { color: palette.text }]} numberOfLines={1} testID={priceTestID}>{price}</Text>
            {priceMeta ? <Text style={[s.priceMeta, { color: palette.textMuted }]} numberOfLines={1}>{priceMeta}</Text> : null}
          </View>
        ) : null}
        {chevron ? <Feather name="chevron-right" size={18} color={colors.textDim} style={s.chevron} /> : null}
      </View>

      {firstMeta || body || status || rightMeta || bookmark || unread > 0 ? (
        <View style={s.bottomRow}>
          <View style={s.bottomText}>
            {firstMeta ? <Text style={[s.meta, { color: palette.textMuted }]} numberOfLines={1}>{firstMeta}</Text> : null}
            {body ? <Text style={[s.description, { color: palette.textMuted }]} numberOfLines={1} ellipsizeMode="tail">{body}</Text> : null}
            {status ? <StatusPill status={status.key} label={status.label} color={status.color} testID={status.testID} /> : null}
          </View>
          {rightMeta ? <Text style={[s.rightMeta, { color: palette.textMuted }]} numberOfLines={1}>{rightMeta}</Text> : null}
            {unread > 0 ? <View style={[s.unread, { backgroundColor: colors.error }]} testID="deals-card-unread"><Text style={s.unreadText}>{unread > 9 ? '9+' : unread}</Text></View> : null}
          {bookmark ? <BookmarkButton saved={bookmark.saved} onPress={bookmark.onToggle} testID={bookmark.testID} accessibilityLabel={bookmark.accessibilityLabel} /> : null}
        </View>
      ) : null}
      {children}
    </Card>
  );
}

const s = StyleSheet.create({
  // Card-only density contract. Screen header, route controls, filters and
  // bottom navigation remain outside this component and keep their own sizes.
  card: { paddingHorizontal: 12, paddingVertical: 7, minHeight: 84, borderRadius: 18 },
  dimmed: { opacity: 0.62 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', minWidth: 0 },
  routeText: { flex: 1, minWidth: 0, fontSize: 16, lineHeight: 20, fontWeight: '700', letterSpacing: -0.15 },
  priceColumn: { width: PRICE_COLUMN_WIDTH, marginLeft: 8, alignItems: 'flex-end', flexShrink: 0 },
  // Stretch the two labels across the fixed rail. On Android this prevents
  // an intrinsic-width Text node from ellipsizing a short price such as $8 000.
  price: { alignSelf: 'stretch', textAlign: 'right', fontVariant: ['tabular-nums'], letterSpacing: -0.1 },
  priceMeta: { alignSelf: 'stretch', fontSize: 11, lineHeight: 13, fontWeight: '600', textAlign: 'right' },
  chevron: { marginLeft: 4, marginTop: 1, flexShrink: 0 },
  meta: { fontSize: 12, lineHeight: 14, fontWeight: '600' },
  bottomRow: { flexDirection: 'row', alignItems: 'center', minHeight: 34, marginTop: 1, gap: 7 },
  bottomText: { flex: 1, minWidth: 0, justifyContent: 'center' },
  description: { fontSize: 12, lineHeight: 14, fontWeight: '500' },
  rightMeta: { fontSize: 12, lineHeight: 16, fontWeight: '600', flexShrink: 0 },
  unread: { minWidth: 19, height: 19, paddingHorizontal: 5, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  unreadText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
});
