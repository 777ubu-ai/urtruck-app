// FeedCard — unified marketplace card for cargo and trips.
// Route is the primary visual anchor; price and save action are secondary.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useV1Colors, v1AccentFor } from '../../../theme/designV1';
import { colors as v2 } from '../../../theme/designSystemV2';
import { useI18n } from '../../../utils/useI18n';
import { localizePlace } from '../../../utils/places';
import { countryFlag } from '../../../utils/countryFlags';

const SAVE = '#34936B';
const SAVE_SOFT = '#EAF5EF';

export default function FeedCard({
  variant = 'cargo',
  accent = 'driver',
  route,
  title,
  subtitle,
  meta = [],
  priceText,
  priceCaption, // маленькая подпись под ценой/рейтингом (напр. кол-во отзывов)
  status,
  responses,
  bottomLeft,
  bottomRight,
  onPress,
  favActive,
  onToggleFav,
  compact = false,
  testID,
}) {
  const colors = useV1Colors();
  const { t, lang } = useI18n();
  const a = v1AccentFor(accent === 'cargo' ? 'client' : 'driver');
  const iconName = variant === 'trip' ? 'truck' : 'package';

  const trimSafe = (v) => (typeof v === 'string' ? v.trim() : '');
  const isEmptyOrDash = (s) => !s || s === '—' || s === '-' || s === '–';
  const fromText = trimSafe(route && route.from);
  const toText = trimSafe(route && route.to);
  const fromCountry = trimSafe(route && route.fromCountry);
  const toCountry = trimSafe(route && route.toCountry);
  const hasRoute = !(isEmptyOrDash(fromText) && isEmptyOrDash(toText));
  const loc = (v) => localizePlace(v, lang);
  const ff = (code) => countryFlag(code);
  const routeText = hasRoute
    ? `${isEmptyOrDash(fromText) ? '—' : `${ff(fromCountry) || ''} ${loc(fromText)}`.trim()} → ${isEmptyOrDash(toText) ? '—' : `${ff(toCountry) || ''} ${loc(toText)}`.trim()}`
    : t('route_pending');

  const titleOverride = typeof title === 'string' ? title.trim() : '';
  const titleText = titleOverride || routeText;
  const titleStrong = !!titleOverride || hasRoute;
  const compactMeta = meta.map((m) => m.value).filter(Boolean).join('  ·  ');
  const Card = onPress ? TouchableOpacity : View;

  return (
    <Card
      onPress={onPress}
      activeOpacity={0.85}
      style={[s.card, compact && s.cardCompact, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID={testID}
    >
      <View style={[s.primaryRow, compact && s.primaryRowCompact]}>
        {compact ? null : (
          <View style={[s.iconBox, { backgroundColor: colors.surfaceLift, borderColor: colors.border }]}>
            <Feather name={iconName} size={20} color={v2.textSecondary} />
          </View>
        )}
        <View style={s.primaryText}>
          <Text
            style={[s.route, compact && s.routeCompact, { color: titleStrong ? colors.text : v2.textTertiary }]}
            numberOfLines={compact ? 1 : 2}
          >
            {titleText}
          </Text>
          {!compact && subtitle ? (
            <Text style={[s.subtitle, { color: colors.textMuted }]} numberOfLines={1}>{subtitle}</Text>
          ) : null}
          {compact && (compactMeta || subtitle) ? (
            <Text style={[s.metaCompact, { color: colors.textDim }]} numberOfLines={1}>
              {compactMeta || subtitle}
            </Text>
          ) : null}
        </View>
      </View>

      {meta.length && !compact ? (
        <View style={[s.metaRow, { borderTopColor: colors.border }]}>
          {meta.map((m, i) => (
            <View key={i} style={s.metaPill}>
              {m.icon ? <Text style={[s.metaIcon, { color: colors.textDim }]}>{m.icon}</Text> : null}
              <View>
                {m.label ? <Text style={[s.metaLabel, { color: colors.textDim }]}>{m.label}</Text> : null}
                <Text style={[s.metaValue, { color: colors.text }]} numberOfLines={1}>{m.value}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {(status || priceText || onToggleFav) ? (
        <View style={[s.valueRow, compact && s.valueRowCompact]}>
          <View style={s.valueLeft}>
            {status ? (
              <View style={[s.statusPill, { borderColor: colors.border }]}>
                <Text style={[s.statusText, { color: colors.textMuted }]}>{status}</Text>
              </View>
            ) : null}
          </View>
          <View style={s.valueRight}>
            {priceText ? (
              <View style={s.priceCol}>
                <Text style={[s.price, compact && s.priceCompact, { color: colors.text }]} numberOfLines={1}>
                  {priceText}
                </Text>
                {priceCaption ? (
                  <Text style={[s.priceCaption, { color: colors.textDim }]} numberOfLines={1}>
                    {priceCaption}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {onToggleFav ? (
              <TouchableOpacity
                onPress={(e) => { e?.stopPropagation?.(); onToggleFav(); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={[s.bookmarkBtn, favActive && s.bookmarkBtnActive]}
                testID="feed-fav"
                accessibilityRole="button"
                accessibilityState={{ selected: !!favActive }}
              >
                <Feather
                  name="heart"
                  size={20}
                  color={favActive ? SAVE : colors.textMuted}
                  fill={favActive ? SAVE : 'transparent'}
                />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null}

      {responses != null && responses > 0 ? (
        <Text style={[s.responses, { color: colors.textMuted }]}>
          {responses} {responses === 1 ? t('feed_response_one') : t('feed_response_many')}
        </Text>
      ) : null}

      {(bottomLeft || bottomRight) && !compact ? (
        <View style={s.bottomRow}>
          {bottomLeft ? (
            <TouchableOpacity
              onPress={bottomLeft.onPress}
              activeOpacity={0.85}
              style={[s.btn, { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: bottomLeft.filled ? a.main : colors.border }]}
              testID={bottomLeft.testID}
            >
              <Text style={[s.btnText, { color: bottomLeft.filled ? a.main : colors.text }]}>{bottomLeft.label}</Text>
            </TouchableOpacity>
          ) : null}
          {bottomRight ? (
            <TouchableOpacity
              onPress={bottomRight.onPress}
              activeOpacity={0.85}
              style={[s.btn, { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: a.main }]}
              testID={bottomRight.testID}
            >
              <Text style={[s.btnText, { color: a.main }]}>{bottomRight.label}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const s = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardCompact: { padding: 12, marginBottom: 8 },
  primaryRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  primaryRowCompact: { gap: 0 },
  primaryText: { flex: 1, minWidth: 0 },
  iconBox: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  route: { fontSize: 17, lineHeight: 21, fontWeight: '700', letterSpacing: -0.2 },
  routeCompact: { fontSize: 16, lineHeight: 20 },
  subtitle: { fontSize: 14, marginTop: 4 },
  metaCompact: { fontSize: 12, lineHeight: 16, fontWeight: '600', marginTop: 5 },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    marginTop: 8,
  },
  metaPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  metaIcon: { fontSize: 14 },
  metaLabel: { fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase' },
  metaValue: { fontSize: 13, fontWeight: '700' },
  valueRow: { minHeight: 44, marginTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  valueRowCompact: { minHeight: 38, marginTop: 5 },
  valueLeft: { flex: 1, alignItems: 'flex-start' },
  valueRight: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1, backgroundColor: 'transparent' },
  statusText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  priceCol: { alignItems: 'flex-end' },
  price: { fontSize: 20, lineHeight: 24, fontWeight: '700', fontVariant: ['tabular-nums'] },
  priceCompact: { fontSize: 18, lineHeight: 22 },
  priceCaption: { fontSize: 11, lineHeight: 14, marginTop: 1 },
  bookmarkBtn: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  bookmarkBtnActive: { backgroundColor: SAVE_SOFT },
  responses: { fontSize: 11, marginTop: 2, marginBottom: 6 },
  bottomRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  btn: { flex: 1, minHeight: 44, paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 14, fontWeight: '600' },
});
