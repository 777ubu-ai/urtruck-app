// FeedCard — unified card for cargo (07/12) and trip (08/11).
// Stage 6: theme-aware fill / border / labels.
//
// Props:
//   variant:   'cargo' | 'trip'   — drives icon + bottom CTA defaults
//   accent:    'driver' | 'cargo' — color (emerald / orange)
//   route:     { from, to }
//   subtitle:  string             — desc / driver-name
//   meta:      [{ icon, label, value }]   — inline pills (Выезд / Вес / Объём…)
//   priceText: string             — pre-formatted ($12 000 / 450 000 ₸ / По договорённости)
//   priceCaption: string          — "за рейс" etc.
//   status:    string             — chip in the top-right
//   bottomLeft / bottomRight: { label, onPress, filled }
//   responses: number             — small count line ("👥 12 откликов")

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useV1Colors, v1Radius, v1AccentFor } from '../../../theme/designV1';
import { colors as v2 } from '../../../theme/designSystemV2';

export default function FeedCard({
  variant = 'cargo',
  accent = 'driver',
  route,
  subtitle,
  meta = [],
  priceText,
  priceCaption,
  status,
  responses,
  bottomLeft,
  bottomRight,
  onPress,
  testID,
}) {
  const colors = useV1Colors();
  const a = v1AccentFor(accent === 'cargo' ? 'client' : 'driver');
  // Phase 2A: вместо emoji 📦/🚛 — Feather outline icon (2px stroke).
  // Цветом идёт textSecondary (slate), а не accent — иконка-шильдик
  // не должна конкурировать с ценой за внимание.
  const iconName = variant === 'trip' ? 'truck' : 'package';

  // Phase 2A: empty-route fallback. На TestFlight build 1 пользователь
  // видел карточки "— → —"; backend иногда возвращает from=null, to=null
  // (битый импорт / старая строка). Покажем человеческий текст вместо
  // двух дефисов. Карточку всё равно отрисовываем — если её скрыть,
  // пагинация съест слот и пользователь не поймёт, что пропало.
  // RC2 hotfix (P0-2): user видел "Маршрут не указан" на just-created
  // cargos даже когда from/to реально были выбраны. Источники могут
  // отдать строку с пробелами/пустой строкой/whitespace-only — добавляем
  // строгий trim-check + явный fallback на second-string (если from
  // пуст а to нет — показываем "— → To"; если оба пусто — "Маршрут
  // уточняется"). Не плодим "Маршрут не указан" — оно звучит как ошибка
  // публикации.
  // PR-A re-apply (P0-2 route mapping): backend / normalizers иногда
  // подсовывают строку '—' как fallback для пустого поля (см. normalizeTrip
  // dash-сахар). Раньше hasRoute=true для '— → —' давало карточку с двумя
  // дефисами, которая выглядела как полноценная запись. Теперь явно
  // считаем '—' (и юникод-варианты длинного тире) пустой строкой.
  const trimSafe = (v) => (typeof v === 'string' ? v.trim() : '');
  const isEmptyOrDash = (s) => !s || s === '—' || s === '-' || s === '–';
  const fromText = trimSafe(route && route.from);
  const toText = trimSafe(route && route.to);
  const hasRoute = !(isEmptyOrDash(fromText) && isEmptyOrDash(toText));
  const routeText = hasRoute
    ? `${isEmptyOrDash(fromText) ? '—' : fromText} → ${isEmptyOrDash(toText) ? '—' : toText}`
    : 'Маршрут уточняется';

  const Card = onPress ? TouchableOpacity : View;
  return (
    <Card
      onPress={onPress}
      activeOpacity={0.85}
      style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID={testID}
    >
      <View style={s.topRow}>
        {/* Stage 16: cargo/trip glyph tile loses the accent halo —
            neutral surface with the same hairline border the rest
            of the card uses. */}
        <View style={[s.iconBox, { backgroundColor: colors.surfaceLift, borderColor: colors.border }]}>
          <Feather name={iconName} size={20} color={v2.textSecondary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={[s.route, { color: hasRoute ? colors.text : v2.textTertiary }]}
            numberOfLines={1}
          >
            {routeText}
          </Text>
          {subtitle ? <Text style={[s.subtitle, { color: colors.textMuted }]} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          {/* Stage 16: status pill is now neutral (muted text + hairline
              border on the card surface). The accent-tinted pill on
              every card competed with the price chip and made every
              row feel like a CTA. */}
          {status ? (
            <View style={[s.statusPill, { backgroundColor: 'transparent', borderColor: colors.border }]}>
              <Text style={[s.statusText, { color: colors.textMuted }]}>{status}</Text>
            </View>
          ) : null}
          {priceText ? (
            <Text style={[s.price, { color: a.main, marginTop: status ? 6 : 0 }]} numberOfLines={1}>
              {priceText}
            </Text>
          ) : null}
          {priceCaption ? <Text style={[s.priceCaption, { color: colors.textMuted }]}>{priceCaption}</Text> : null}
        </View>
      </View>

      {meta.length ? (
        <View style={[s.metaRow, { borderTopColor: colors.border }]}>
          {meta.map((m, i) => (
            <View key={i} style={s.metaPill}>
              {/* Stage 16: meta-row glyphs (📅/⚖️/📐) muted to textDim
                  so only the price stays accented. */}
              {m.icon ? <Text style={[s.metaIcon, { color: colors.textDim }]}>{m.icon}</Text> : null}
              <View>
                {m.label ? <Text style={[s.metaLabel, { color: colors.textDim }]}>{m.label}</Text> : null}
                <Text style={[s.metaValue, { color: colors.text }]} numberOfLines={1}>{m.value}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {/* Phase 2A: "0 откликов" не выпячиваем — если данных нет, строки нет.
          B2B-карточка должна показывать число только когда оно несёт смысл. */}
      {responses != null && responses > 0 ? (
        <Text style={[s.responses, { color: colors.textMuted }]}>{responses} {responses === 1 ? 'отклик' : 'откликов'}</Text>
      ) : null}

      {(bottomLeft || bottomRight) ? (
        <View style={s.bottomRow}>
          {bottomLeft ? (
            <TouchableOpacity
              onPress={bottomLeft.onPress}
              activeOpacity={0.85}
              style={[
                s.btn,
                bottomLeft.filled
                  ? { backgroundColor: a.main, borderColor: a.main }
                  : { backgroundColor: 'transparent', borderColor: colors.borderStrong },
              ]}
              testID={bottomLeft.testID}
            >
              <Text style={[s.btnText, { color: bottomLeft.filled ? '#0A0A0A' : colors.text }]}>{bottomLeft.label}</Text>
            </TouchableOpacity>
          ) : null}
          {bottomRight ? (
            <TouchableOpacity
              onPress={bottomRight.onPress}
              activeOpacity={0.85}
              style={[
                s.btn,
                // Stage 16: outline variant uses the role accent on a
                // transparent fill (thin green border + green label)
                // instead of the previous neutral grey border. Solid
                // green is reserved for the screen-level primary CTA
                // (publish-route / publish-cargo / floating +).
                bottomRight.filled !== false
                  ? { backgroundColor: a.main, borderColor: a.main }
                  : { backgroundColor: 'transparent', borderColor: a.main },
              ]}
              testID={bottomRight.testID}
            >
              <Text style={[s.btnText, { color: (bottomRight.filled !== false) ? '#0A0A0A' : a.main }]}>{bottomRight.label}</Text>
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
    borderRadius: v1Radius.card,
    padding: 14,
    marginBottom: 10,
  },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 8 },
  iconBox: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 22 },
  route: { fontSize: 16, fontWeight: '800' },
  subtitle: { fontSize: 12, marginTop: 2 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
  statusText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  price: { fontSize: 15, fontWeight: '900' },
  priceCaption: { fontSize: 10, marginTop: 1 },
  metaRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    marginTop: 4,
  },
  metaPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 4,
  },
  metaIcon: { fontSize: 14 },
  metaLabel: { fontSize: 9, letterSpacing: 0.5, textTransform: 'uppercase' },
  metaValue: { fontSize: 12, fontWeight: '700' },
  responses: { fontSize: 11, marginBottom: 8 },
  bottomRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  btn: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  btnText: { fontSize: 13, fontWeight: '700' },
});
