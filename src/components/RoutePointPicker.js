// RoutePointPicker — Stage 7 structured route-point picker.
//
// Replaces the legacy CityInput (a flat searchable list) with a guided
// three-step flow: country → type → point. The user can also type
// directly to search across countries, and a "Свой вариант" fallback
// keeps the form usable when the registry doesn't carry the desired
// point yet.
//
// Layout decisions:
//   1. Step indicator at the top is just three small chips so the
//      user always sees where they are. Tapping a finished chip
//      jumps back to that step.
//   2. The list uses ScrollView, not FlatList — these lists are short
//      (≤12 items per step), and a regular ScrollView avoids the
//      web-only quirks of nested virtualisation inside a parent
//      ScrollView (overflow / scroll capture).
//   3. Auto-close: once the user picks a point, we call onChange
//      with the formatted string + the point object, and the parent
//      typically folds the picker (see CreateCargo / CreateTrip).
//
// Theme-aware via useV1Colors.

import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useV1Colors, v1Radius } from '../theme/designV1';
import { useI18n } from '../utils/useI18n';
import {
  COUNTRIES, COUNTRY_ORDER, POINT_TYPES,
  searchPoints, formatPoint, pointsForCountry,
} from '../utils/geography';

const i18nLabel = (t, key, fallback) => {
  const v = t(key);
  return v && v !== key ? v : fallback;
};

export default function RoutePointPicker({
  value,
  onChange,
  placeholder,
  testID,
  // Optional: lock the picker to one or more countries (useful if the
  // role implies a specific corridor). Default = all countries.
  allowedCountries,
}) {
  const v1 = useV1Colors();
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [step, setStep] = useState('country');     // 'country' | 'type' | 'point'
  const [country, setCountry] = useState(null);
  const [pointType, setPointType] = useState(null);

  const s = useMemo(() => StyleSheet.create({
    wrap: { borderWidth: 1, borderRadius: v1Radius.field, overflow: 'hidden' },
    searchRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 14, paddingVertical: 10,
      borderBottomWidth: 1, borderBottomColor: v1.border,
    },
    searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
    stepRow: {
      flexDirection: 'row', gap: 6,
      paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6,
    },
    stepChip: {
      paddingHorizontal: 10, paddingVertical: 4,
      borderRadius: 999, borderWidth: 1, borderColor: v1.border,
    },
    stepChipActive: { backgroundColor: v1.surfaceLift, borderColor: v1.borderStrong },
    stepChipText: { fontSize: 11, fontWeight: '700' },
    stage: { paddingHorizontal: 8, paddingTop: 4, paddingBottom: 10, maxHeight: 320 },
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: 10, paddingVertical: 12,
      borderRadius: 12,
    },
    rowName: { fontSize: 14, fontWeight: '700' },
    rowMeta: { fontSize: 11, marginTop: 2 },
    icon: { fontSize: 18 },
    fallback: {
      paddingHorizontal: 14, paddingVertical: 10,
      borderTopWidth: 1, borderTopColor: v1.border,
      flexDirection: 'row', alignItems: 'center', gap: 8,
    },
    fallbackText: { fontSize: 12, fontWeight: '700' },
  }), [v1]);

  const visibleCountries = useMemo(() => {
    const order = allowedCountries && allowedCountries.length
      ? COUNTRY_ORDER.filter((c) => allowedCountries.includes(c))
      : COUNTRY_ORDER;
    return order.filter((c) => COUNTRIES[c]);
  }, [allowedCountries]);

  // Free-text search bypasses the step flow — show top matches across
  // every country.
  const searchHits = query.trim().length >= 2
    ? searchPoints(query, { country: country || undefined, type: pointType || undefined })
    : null;

  const commit = (point) => {
    const formatted = formatPoint(point);
    onChange?.(formatted, point);
  };

  const useFreeText = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    onChange?.(trimmed, { name: trimmed, country: 'XX', type: 'city', custom: true });
  };

  return (
    <View
      style={[s.wrap, { backgroundColor: v1.surface, borderColor: v1.border }]}
      testID={testID}
    >
      <View style={s.searchRow}>
        <Text style={{ fontSize: 14 }}>🔍</Text>
        <TextInput
          style={[s.searchInput, { color: v1.text }]}
          value={query}
          onChangeText={setQuery}
          placeholder={placeholder || i18nLabel(t, 'route_point_placeholder', 'Поиск города или погранперехода')}
          placeholderTextColor={v1.placeholder}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* Step indicator (only meaningful when the user is browsing
          step-by-step, not searching). */}
      {!searchHits ? (
        <View style={s.stepRow}>
          {[
            { key: 'country', label: i18nLabel(t, 'route_step_country', 'Страна'), value: country ? COUNTRIES[country].name : null },
            { key: 'type',    label: i18nLabel(t, 'route_step_type', 'Тип'),       value: pointType ? POINT_TYPES.find((p) => p.key === pointType)?.label : null },
            { key: 'point',   label: i18nLabel(t, 'route_step_point', 'Точка'),    value: null },
          ].map((it) => (
            <TouchableOpacity
              key={it.key}
              onPress={() => {
                if (it.key === 'country') { setStep('country'); setCountry(null); setPointType(null); }
                else if (it.key === 'type' && country) { setStep('type'); setPointType(null); }
                else if (it.key === 'point' && country && pointType) { setStep('point'); }
              }}
              style={[s.stepChip, step === it.key ? s.stepChipActive : null]}
            >
              <Text style={[s.stepChipText, { color: step === it.key ? v1.text : v1.textMuted }]}>
                {it.label}{it.value ? ` · ${it.value}` : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <ScrollView style={s.stage} keyboardShouldPersistTaps="handled">
        {searchHits ? (
          searchHits.length === 0 ? (
            <Text style={{ color: v1.textMuted, padding: 14, fontSize: 12 }}>
              {i18nLabel(t, 'route_no_results', 'Ничего не найдено')}
            </Text>
          ) : (
            searchHits.map((p, i) => (
              <PointRow key={`${p.country}:${p.type}:${p.name}:${i}`} p={p} v1={v1} s={s} onPick={() => commit(p)} />
            ))
          )
        ) : step === 'country' ? (
          visibleCountries.map((code) => {
            const country = COUNTRIES[code];
            return (
              <TouchableOpacity
                key={code}
                onPress={() => { setCountry(code); setStep('type'); }}
                style={s.row}
                testID={`route-country-${code}`}
              >
                <Text style={s.icon}>{country.flag}</Text>
                <Text style={[s.rowName, { color: v1.text, flex: 1 }]}>{country.name}</Text>
                <Text style={{ color: v1.textMuted, fontSize: 16 }}>›</Text>
              </TouchableOpacity>
            );
          })
        ) : step === 'type' ? (
          POINT_TYPES.map((it) => {
            const count = pointsForCountry(country, it.key).length;
            return (
              <TouchableOpacity
                key={it.key}
                onPress={() => { setPointType(it.key); setStep('point'); }}
                style={s.row}
                disabled={count === 0}
                testID={`route-type-${it.key}`}
              >
                <Text style={s.icon}>{it.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.rowName, { color: count === 0 ? v1.textDim : v1.text }]}>
                    {i18nLabel(t, it.labelKey, it.label)}
                    {count > 0 ? ` · ${count}` : ''}
                  </Text>
                  <Text style={[s.rowMeta, { color: v1.textMuted }]} numberOfLines={1}>
                    {it.description}
                  </Text>
                </View>
                <Text style={{ color: v1.textMuted, fontSize: 16 }}>›</Text>
              </TouchableOpacity>
            );
          })
        ) : (
          // step === 'point'
          (() => {
            const list = pointsForCountry(country, pointType);
            if (list.length === 0) {
              return (
                <Text style={{ color: v1.textMuted, padding: 14, fontSize: 12 }}>
                  {i18nLabel(t, 'route_no_points_for_type', 'Для выбранной страны пока нет точек этого типа. Введите вручную ниже.')}
                </Text>
              );
            }
            return list.map((p, i) => (
              <PointRow key={`${p.country}:${p.type}:${p.name}:${i}`} p={p} v1={v1} s={s} onPick={() => commit(p)} />
            ));
          })()
        )}
      </ScrollView>

      {/* Free-text fallback for when the user typed something and the
          registry doesn't carry it yet. */}
      {query.trim().length >= 2 ? (
        <TouchableOpacity onPress={useFreeText} style={s.fallback} testID="route-use-free-text">
          <Text style={{ fontSize: 14 }}>✏️</Text>
          <Text style={[s.fallbackText, { color: v1.text }]} numberOfLines={1}>
            {i18nLabel(t, 'route_use_free_text', 'Использовать как есть')} · {query.trim()}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function PointRow({ p, v1, s, onPick }) {
  const country = COUNTRIES[p.country] || {};
  const partnerCountry = p.partnerCountry ? COUNTRIES[p.partnerCountry] : null;
  return (
    <TouchableOpacity onPress={onPick} style={s.row} testID={`route-point-${p.name}`}>
      <Text style={s.icon}>
        {p.type === 'border' ? '🛂' : p.type === 'terminal' ? '🏗' : country.flag || '📍'}
      </Text>
      <View style={{ flex: 1 }}>
        <Text style={[s.rowName, { color: v1.text }]} numberOfLines={1}>
          {p.name}
        </Text>
        <Text style={[s.rowMeta, { color: v1.textMuted }]} numberOfLines={1}>
          {country.name || p.country}
          {p.type === 'border' && partnerCountry ? ` ↔ ${partnerCountry.name}` : ''}
          {p.type === 'terminal' ? ' · терминал' : ''}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
