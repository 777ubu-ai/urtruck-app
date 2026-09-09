// MarketplaceCard — THE canonical marketplace listing card (Design Bible
// "Direction B", owner-approved 2026-09-09, Commit 3). One shared card
// family for every feed: shipper trip feed (FeedScreen), driver cargo feed
// (CargoFeedScreen), my trips/cargos (MyTripsScreen), favorites
// (FavoritesScreen), deals inbox (DealsScreen via its CompactDealCard
// adapter).
//
// Canon (approved preview feed-driver-ru.png / deals.png):
//   - Card primitive: radius 16, padding 16, 1px border, NO shadow,
//     NO green rail (the legacy `#3A9972` rail is gone).
//   - Top row: flags + route on the left (Flag 20×14 before each city,
//     city 16/700, numberOfLines 2, flexShrink with minWidth protection),
//     fixed right price column (width 28%, price 17/800 tabular-nums,
//     meta/date under it, left-aligned, never overlapping the route).
//   - Meta lines: 12/16 500 secondary (cargo name, weight/volume/type,
//     driver/truck info, dates).
//   - Bottom row: StatusPill (deal status, role colors) or type badge
//     («Груз»/«Рейс», pill radius 999 — cargo tinted clientOrange-soft,
//     trip tinted accent-soft) + counterparty name (flex, ellipsis) +
//     optional right meta (time/distance/bids) + 44dp bookmark.
//   - Deals extras: unread badge, chevron, `dimmed` archive state.
//
// Props-driven: screens keep their own data plumbing and pass display
// strings; this component never fetches and never translates.
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import { useV1Colors, useV1Typography, v1Radius } from '../../../theme/designV1';
import Card from './Card';
import Flag from './Flag';
import StatusPill from './StatusPill';

const PRICE_COLUMN_WIDTH = '28%';
const BOOKMARK_HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };

// Type-badge accent per listing kind. Cargo rides the clientOrange role
// (LIGHT only defines `clientAccent`; dark falls back to the warning hue —
// same orange family shifted for dark surfaces). Trip rides the driver
// accent. Background is a dosed 8% tint of the accent.
const badgeTheme = (colors, kind) => {
  const accent = kind === 'cargo' ? (colors.clientAccent || colors.warning) : colors.driver;
  return { accent, soft: `${accent}14` };
};

export default function MarketplaceCard({
  testID,
  accessibilityLabel,
  onPress,
  style,
  // Route: either structured { from, to, fromFlag, toFlag, testID,
  // numberOfLines } (renders Flag 20×14 before each city) or a plain string
  // (prebuilt label, e.g. the deals inbox route).
  route,
  price,
  priceTestID,
  priceMeta,
  // Array of secondary 12/16 500 lines (cargo name, specs, info).
  meta = [],
  // { label, kind: 'cargo'|'trip' } — type badge for listing cards.
  badge,
  // { key, label, color?, testID? } — StatusPill; `color` overrides the
  // v1StatusColors role mapping (deals inbox passes its own attention
  // colors for receipt-confirmation states).
  status,
  counterparty,
  // Trailing bottom-row meta: time / distance / bids count.
  rightMeta,
  unread = 0,
  chevron = false,
  dimmed = false,
  // { saved, onToggle, testID, accessibilityLabel } — 44dp target.
  bookmark,
  children,
}) {
  const colors = useV1Colors();
  const typo = useV1Typography();

  const structured = route && typeof route === 'object';
  const from = structured ? route.from : route;
  const to = structured ? route.to : null;
  const fromFlag = structured ? route.fromFlag : null;
  const toFlag = structured ? route.toFlag : null;
  const routeTestID = structured ? route.testID : undefined;
  const routeLines = structured ? (route.numberOfLines ?? 2) : 1;

  const badgeColors = badge ? badgeTheme(colors, badge.kind) : null;

  return (
    <Card
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={[dimmed && { opacity: 0.62 }, style]}
    >
      {/* ── Top row: route + fixed price column ─────────────────────── */}
      <View style={s.topRow}>
        <View style={s.routeWrap} testID={routeTestID}>
          <Text style={[s.routeCity, { color: colors.text }]} numberOfLines={routeLines}>
            {fromFlag ? <Text style={s.routeFlagWrap}><Flag code={fromFlag} /> </Text> : null}
            {from}
            {to ? (
              <>
                {' → '}
                {toFlag ? <Text style={s.routeFlagWrap}><Flag code={toFlag} /> </Text> : null}
                {to}
              </>
            ) : null}
          </Text>
        </View>
        {price ? (
          <View style={s.priceColumn}>
            <Text
              style={[typo.price, s.price, { color: colors.text }]}
              numberOfLines={1}
              testID={priceTestID}
            >
              {price}
            </Text>
            {priceMeta ? (
              <Text style={[s.priceMeta, { color: colors.textDim }]} numberOfLines={1}>{priceMeta}</Text>
            ) : null}
          </View>
        ) : null}
        {chevron ? <Feather name="chevron-right" size={17} color={colors.textDim} style={s.chevron} /> : null}
      </View>

      {/* ── Secondary meta lines ────────────────────────────────────── */}
      {meta.filter(Boolean).map((line, index) => (
        <Text key={`meta-${index}`} style={[s.metaLine, { color: colors.textMuted }]} numberOfLines={1}>
          {line}
        </Text>
      ))}

      {/* ── Bottom row: pill + counterparty + right meta + bookmark ─── */}
      {status || badge || counterparty || rightMeta || bookmark ? (
        <View style={[s.bottomRow, { borderTopColor: colors.border }]}>
          {status ? (
            <StatusPill
              status={status.key}
              label={status.label}
              color={status.color}
              testID={status.testID}
            />
          ) : badge ? (
            <View style={[s.typeBadge, { backgroundColor: badgeColors.soft }]}>
              <Text style={[s.typeBadgeText, { color: badgeColors.accent }]}>{badge.label}</Text>
            </View>
          ) : null}
          {counterparty ? (
            <Text style={[s.counterparty, { color: colors.textMuted }]} numberOfLines={1}>{counterparty}</Text>
          ) : null}
          <View style={s.bottomSpacer} />
          {rightMeta ? (
            <Text style={[s.rightMeta, { color: colors.textDim }]} numberOfLines={1}>{rightMeta}</Text>
          ) : null}
          {unread > 0 ? (
            <View style={[s.unreadBadge, { backgroundColor: colors.error }]} testID="deals-card-unread">
              <Text style={[s.unreadText, { color: colors.driverOnAccent }]}>{unread > 9 ? '9+' : unread}</Text>
            </View>
          ) : null}
          {bookmark ? (
            <Pressable
              onPress={(event) => { event?.stopPropagation?.(); bookmark.onToggle(); }}
              hitSlop={BOOKMARK_HIT_SLOP}
              style={s.bookmarkBtn}
              testID={bookmark.testID}
              accessibilityRole="button"
              accessibilityLabel={bookmark.accessibilityLabel}
              accessibilityState={{ selected: !!bookmark.saved }}
            >
              {bookmark.saved ? (
                <FontAwesome5 name="bookmark" size={18} color={colors.driver} solid />
              ) : (
                <Feather name="bookmark" size={18} color={colors.textDim} />
              )}
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {children}
    </Card>
  );
}

const s = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  routeWrap: {
    flex: 1,
    minWidth: 0,
    // Density baseline inherited from the cargo feed contract
    // (minHeight 120 incl. price column) — route may wrap to 2 lines.
    minHeight: 48,
    paddingRight: 4,
  },
  routeCity: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
    letterSpacing: -0.1,
    flexShrink: 1,
  },
  routeFlagWrap: {
    // Inline flag keeps the 20×14 flag aligned with the 20px line box.
    lineHeight: undefined,
  },
  priceColumn: {
    width: PRICE_COLUMN_WIDTH,
    flexShrink: 0,
    marginLeft: 12,
    alignItems: 'flex-start',
  },
  price: {
    fontVariant: ['tabular-nums'],
    letterSpacing: 0,
    alignSelf: 'flex-start',
  },
  priceMeta: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    marginTop: 2,
    alignSelf: 'flex-start',
  },
  chevron: {
    marginLeft: 6,
    marginTop: 2,
    flexShrink: 0,
  },
  metaLine: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    marginTop: 2,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
  },
  typeBadge: {
    borderRadius: v1Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexShrink: 0,
  },
  typeBadgeText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  counterparty: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  bottomSpacer: { flexShrink: 1 },
  rightMeta: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },
  unreadBadge: {
    minWidth: 21,
    height: 21,
    paddingHorizontal: 5,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  unreadText: {
    fontSize: 11,
    fontWeight: '800',
  },
  bookmarkBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    margin: -6,
    flexShrink: 0,
  },
});
