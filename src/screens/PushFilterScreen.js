import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Switch, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import {v1Colors, useV1Colors} from '../theme/designV1';
import { useToast } from '../components/Toast';
import { getPushSettings, setPushSettings } from '../utils/store';

const TRUCK_KEYS = ['tent', 'ref', 'platform', 'auto', 'izoterm', 'cont20', 'cont40', 'jumbo', 'curtain', 'lowloader', 'tanker', 'dumptruck'];

const NOTIF_CATEGORIES = [
  { key: 'new_cargos', icon: '📦' },
  { key: 'bids',       icon: '💬' },
  { key: 'moderation', icon: '🛡' },
  { key: 'reviews',    icon: '⭐' },
  { key: 'trips',      icon: '🚛' },
  { key: 'system',     icon: '🔔' },
];

export default function PushFilterScreen({ navigation, route }) {
  const v1 = useV1Colors();
  const { role } = route.params || {};
  // 5.4: driver-акцент = бренд-зелёный #00E676 (был индиго #4F46E5 —
  // рассинхрон с ролью). Клиент — янтарный.
  const accent = role === 'driver' ? '#00E676' : '#FF8400';
  const { t } = useI18n();
  const { theme } = useTheme();
  const { toast } = useToast();
  const initial = getPushSettings();

  const [onlyMyRoutes, setOnlyMyRoutes] = useState(initial.onlyMyRoutes);
  const [minTons, setMinTons] = useState(initial.minTons);
  const [minPrice, setMinPrice] = useState(initial.minPrice);
  const [types, setTypes] = useState(initial.truckTypes || []);
  const [categories, setCategories] = useState(initial.categories || NOTIF_CATEGORIES.map(c => c.key));

  const toggleType = (k) => setTypes(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]);
  const toggleCategory = (k) => setCategories(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]);

  const save = () => {
    setPushSettings({ onlyMyRoutes, minTons, minPrice, truckTypes: types, categories });
    toast('✓ ' + t('push_saved'), 'success');
    navigation.goBack();
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: v1.bg }]} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[s.backBtn, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[s.backText, { color: theme.text }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[s.title, { color: theme.text }]}>🔔 {t('push_title')}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Категории уведомлений */}
        <Text style={[s.sectionTitle, { color: theme.text }]}>{t('push_categories')}</Text>
        {NOTIF_CATEGORIES.map(cat => (
          <View key={cat.key} style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={[s.label, { color: theme.text }]}>{cat.icon} {t('push_cat_' + cat.key)}</Text>
                <Text style={[s.desc, { color: theme.textMuted }]}>{t('push_cat_' + cat.key + '_desc')}</Text>
              </View>
              <Switch
                value={categories.includes(cat.key)}
                onValueChange={() => toggleCategory(cat.key)}
                trackColor={{ false: theme.border, true: accent }}
                thumbColor="#fff"
              />
            </View>
          </View>
        ))}

        {/* Фильтры грузов */}
        <Text style={[s.sectionTitle, { color: theme.text, marginTop: 16 }]}>{t('push_filter_cargos')}</Text>

        <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={s.row}>
            <Text style={[s.label, { color: theme.text }]}>{t('push_only_my_routes')}</Text>
            <Switch value={onlyMyRoutes} onValueChange={setOnlyMyRoutes}
              trackColor={{ false: theme.border, true: accent }} thumbColor="#fff" />
          </View>
        </View>

        <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[s.label, { color: theme.text, marginBottom: 8 }]}>{t('push_min_tons')}</Text>
          <TextInput style={[s.input, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.border }]}
            placeholder="10" placeholderTextColor={theme.textMuted}
            keyboardType="numeric" value={minTons} onChangeText={setMinTons} />
        </View>

        <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[s.label, { color: theme.text, marginBottom: 8 }]}>{t('push_min_price')}</Text>
          <TextInput style={[s.input, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.border }]}
            placeholder="2000" placeholderTextColor={theme.textMuted}
            keyboardType="numeric" value={minPrice} onChangeText={setMinPrice} />
        </View>

        <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[s.label, { color: theme.text, marginBottom: 8 }]}>{t('push_truck_types')}</Text>
          <View style={s.typesWrap}>
            {TRUCK_KEYS.map(k => (
              <TouchableOpacity key={k}
                style={[s.typeChip, { backgroundColor: theme.bg, borderColor: theme.border },
                  types.includes(k) && { backgroundColor: accent, borderColor: accent }]}
                onPress={() => toggleType(k)}>
                <Text style={[s.typeChipText, { color: theme.textSecondary },
                  types.includes(k) && { color: '#0C0A09' }]}>{t(k)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity style={[s.saveBtn, { backgroundColor: accent }]} onPress={save}>
          <Text style={s.saveBtnText}>{t('push_save_btn')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  backBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  backText: { fontSize: 22 },
  title: { fontSize: 22, fontWeight: '900' },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 10 },
  card: { padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 14, fontWeight: '700' },
  desc: { fontSize: 11, marginTop: 2 },
  input: { padding: 12, borderRadius: 10, fontSize: 14, borderWidth: 1 },
  typesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  typeChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  typeChipText: { fontSize: 12, fontWeight: '600' },
  saveBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 14 },
  saveBtnText: { color: '#0C0A09', fontSize: 16, fontWeight: '800' },
});
