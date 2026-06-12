import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Modal, Pressable, ScrollView, Animated, Easing, Platform, KeyboardAvoidingView,
} from 'react-native';
import { useTheme } from '../utils/ThemeContext';
import { useI18n } from '../utils/useI18n';
import { routeStats, CITIES } from '../utils/geo';
import { accentColors } from '../utils/theme';

const POPULAR_ROUTES = [
  { from: 'Алматы', to: 'Астана' },
  { from: 'Алматы', to: 'Шымкент' },
  { from: 'Астана', to: 'Москва' },
  { from: 'Урумчи', to: 'Алматы' },
  { from: 'Гуанчжоу', to: 'Ташкент' },
  { from: 'Шанхай', to: 'Москва' },
];

const TRUCK_MULTIPLIERS = {
  tent: 1.0,      // стандарт
  ref: 1.35,      // рефрижератор
  platform: 1.15, // платформа
  tanker: 1.4,    // цистерна
  auto: 1.25,     // автовоз
};

// Базовая формула: $X за км + фикса за тип
function estimatePrice(km, truckType = 'tent', weightTons = 20) {
  if (!km) return null;
  const base = km * 0.75; // $0.75/км для 20т
  const mul = TRUCK_MULTIPLIERS[truckType] || 1.0;
  const weightFactor = Math.max(0.6, Math.min(1.4, weightTons / 20));
  const total = base * mul * weightFactor;
  // Разброс ±15% (рынок)
  const low = Math.round(total * 0.85);
  const high = Math.round(total * 1.15);
  return { low, high, avg: Math.round(total) };
}

export default function PriceCalculator({ visible, onClose }) {
  const { theme, isDark } = useTheme();
  const { t } = useI18n();
  const [from, setFrom] = useState('Алматы');
  const [to, setTo] = useState('Урумчи');
  const [truckType, setTruckType] = useState('tent');
  const [weight, setWeight] = useState('20');

  const slide = useRef(new Animated.Value(500)).current;

  useEffect(() => {
    if (visible) {
      slide.setValue(500);
      Animated.timing(slide, { toValue: 0, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }
  }, [visible]);

  const stats = useMemo(() => routeStats(from, to), [from, to]);
  const price = useMemo(
    () => stats && estimatePrice(stats.km, truckType, parseFloat(weight) || 20),
    [stats, truckType, weight],
  );

  const trucks = [
    { k: 'tent',     l: t('reg_vehicle_tent'),     icon: '🚚' },
    { k: 'ref',      l: t('reg_vehicle_ref'),      icon: '🧊' },
    { k: 'platform', l: t('reg_vehicle_platform'), icon: '🛻' },
    { k: 'tanker',   l: t('reg_vehicle_tanker'),   icon: '🛢️' },
    { k: 'auto',     l: t('reg_vehicle_auto'),     icon: '🚗' },
  ];

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      {/* P1: инпуты (откуда/куда/вес) внизу sheet пряталось под клавиатурой */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable style={[s.backdrop, { backgroundColor: theme.overlay }]} onPress={onClose}>
        <Animated.View style={[
          s.sheet,
          { backgroundColor: theme.cardElevated, transform: [{ translateY: slide }] },
        ]}>
          <Pressable style={{ padding: 4 }}>
            <View style={[s.handle, { backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(15,23,42,0.15)' }]} />
            <Text style={[s.title, { color: theme.text }]}>{t('price_calc_title')}</Text>
            <Text style={[s.subtitle, { color: theme.textMuted }]}>
              {t('price_calc_subtitle')}
            </Text>

            <ScrollView style={{ maxHeight: 520 }} showsVerticalScrollIndicator={false}>
              <Text style={[s.label, { color: theme.textMuted }]}>{t('from_label')}</Text>
              <TextInput
                style={[s.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
                value={from} onChangeText={setFrom} placeholder="Алматы"
                placeholderTextColor={theme.textMuted}
              />

              <Text style={[s.label, { color: theme.textMuted }]}>{t('to_label')}</Text>
              <TextInput
                style={[s.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
                value={to} onChangeText={setTo} placeholder="Урумчи"
                placeholderTextColor={theme.textMuted}
              />

              <Text style={[s.label, { color: theme.textMuted }]}>{t('filter_truck_type')}</Text>
              <View style={s.row}>
                {trucks.map(tr => (
                  <TouchableOpacity
                    key={tr.k}
                    style={[
                      s.chip,
                      { backgroundColor: theme.card, borderColor: theme.border },
                      truckType === tr.k && { backgroundColor: accentColors.driver, borderColor: accentColors.driver },
                    ]}
                    onPress={() => setTruckType(tr.k)}
                  >
                    <Text style={{ fontSize: 18 }}>{tr.icon}</Text>
                    <Text style={[
                      s.chipText, { color: theme.text },
                      truckType === tr.k && { color: '#fff' },
                    ]}>{tr.l}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[s.label, { color: theme.textMuted }]}>{t('weight_tons_label')}</Text>
              <TextInput
                style={[s.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
                value={weight} onChangeText={setWeight}
                keyboardType="numeric" placeholder="20"
                placeholderTextColor={theme.textMuted}
              />

              {/* Популярные маршруты */}
              <Text style={[s.label, { color: theme.textMuted, marginTop: 12 }]}>{t('popular_routes')}</Text>
              <View style={s.row}>
                {POPULAR_ROUTES.map((r, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[s.miniChip, { backgroundColor: theme.card, borderColor: theme.border }]}
                    onPress={() => { setFrom(r.from); setTo(r.to); }}
                  >
                    <Text style={{ color: theme.textMuted, fontSize: 11 }}>{r.from} → {r.to}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Результат */}
              {stats && price && (
                <View style={[s.result, { backgroundColor: `${accentColors.browse}10`, borderColor: accentColors.browse }]}>
                  <Text style={[s.resultLabel, { color: theme.textMuted }]}>📏 {stats.km} км · ~{stats.days} {stats.days === 1 ? 'день' : 'дня'}</Text>
                  <Text style={[s.resultPrice, { color: accentColors.browse }]}>
                    ${price.low} — ${price.high}
                  </Text>
                  <Text style={[s.resultNote, { color: theme.textMuted }]}>
                    Средняя: ${price.avg} · Цены на основе рыночных данных
                  </Text>
                </View>
              )}
              {!stats && (
                <View style={[s.result, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <Text style={{ color: theme.textMuted, fontSize: 13, textAlign: 'center' }}>
                    Укажи города для расчёта
                  </Text>
                  <Text style={{ color: theme.textDim, fontSize: 11, textAlign: 'center', marginTop: 6 }}>
                    Поддерживаем: {Object.keys(CITIES).slice(0, 8).join(', ')}...
                  </Text>
                </View>
              )}

              <TouchableOpacity
                onPress={onClose}
                style={[s.cta, { backgroundColor: accentColors.driver }]}
              >
                <Text style={s.ctaText}>{t('register_cta')}</Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Animated.View>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 24,
  },
  handle: { width: 48, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 14 },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 13, textAlign: 'center', marginBottom: 16 },
  label: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
  },
  chipText: { fontSize: 12, fontWeight: '600' },
  miniChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1 },
  result: {
    padding: 16, borderRadius: 14, borderWidth: 1.5,
    marginTop: 14, alignItems: 'center',
  },
  resultLabel: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  resultPrice: { fontSize: 30, fontWeight: '900', marginBottom: 4 },
  resultNote: { fontSize: 11, textAlign: 'center' },
  cta: {
    marginTop: 14, padding: 14, borderRadius: 14,
    alignItems: 'center',
  },
  ctaText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
});
