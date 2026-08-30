import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Switch, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import {v1Colors, useV1Colors} from '../theme/designV1';
import { useToast } from '../components/Toast';
import { getPushSettings, setPushSettings } from '../utils/store';
import { marketAPI } from '../utils/marketAPI';
import Feather from '@expo/vector-icons/Feather';

const TRUCK_KEYS = ['tent', 'ref', 'platform', 'auto', 'izoterm', 'cont20', 'cont40', 'jumbo', 'curtain', 'lowloader', 'tanker', 'dumptruck'];

const NOTIF_CATEGORIES = [
  { key: 'new_cargos', icon: 'package' },
  { key: 'bids',       icon: 'message-square' },
  { key: 'moderation', icon: 'shield' },
  { key: 'reviews',    icon: 'star' },
  { key: 'trips',      icon: 'truck' },
  { key: 'system',     icon: 'bell' },
];

export default function PushFilterScreen({ navigation, route }) {
  const v1 = useV1Colors();
  const { role } = route.params || {};
  // 5.4: driver-акцент = бренд-зелёный #168759 (был индиго #4F46E5 —
  // рассинхрон с ролью). Клиент — янтарный.
  const accent = role === 'driver' ? '#168759' : '#FF8400';
  const { t } = useI18n();
  const { theme } = useTheme();
  const { toast } = useToast();
  const initial = getPushSettings();

  const [onlyMyRoutes, setOnlyMyRoutes] = useState(initial.onlyMyRoutes);
  const [minTons, setMinTons] = useState(initial.minTons);
  const [minPrice, setMinPrice] = useState(initial.minPrice);
  const [types, setTypes] = useState(initial.truckTypes || []);
  const [categories, setCategories] = useState(initial.categories || NOTIF_CATEGORIES.map(c => c.key));
  const [fromCity, setFromCity] = useState(initial.fromCity || '');
  const [toCity, setToCity] = useState(initial.toCity || '');
  const [savedRoutes, setSavedRoutes] = useState([]);
  const [routesLoading, setRoutesLoading] = useState(true);
  const [savingRoute, setSavingRoute] = useState(false);

  const label = (key, fallback) => {
    const value = t(key);
    return value === key ? fallback : value;
  };

  const loadSavedRoutes = async () => {
    setRoutesLoading(true);
    const data = await marketAPI.listSavedRoutes();
    setSavedRoutes(Array.isArray(data?.searches) ? data.searches : []);
    setRoutesLoading(false);
  };

  useEffect(() => {
    let alive = true;
    setRoutesLoading(true);
    marketAPI.listSavedRoutes().then((data) => {
      if (!alive) return;
      setSavedRoutes(Array.isArray(data?.searches) ? data.searches : []);
      setRoutesLoading(false);
    }).catch(() => {
      if (!alive) return;
      setSavedRoutes([]);
      setRoutesLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const toggleType = (k) => setTypes(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]);
  const toggleCategory = (k) => setCategories(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]);

  const save = async () => {
    setPushSettings({ onlyMyRoutes, minTons, minPrice, truckTypes: types, categories, fromCity, toCity });
    if (fromCity.trim() && toCity.trim()) {
      setSavingRoute(true);
      const r = await marketAPI.saveRoute({
        from_city: fromCity.trim(),
        to_city: toCity.trim(),
        truck_type: types[0] || null,
        min_price: minPrice ? Number(minPrice) : null,
        notify: categories.includes('new_cargos'),
      });
      setSavingRoute(false);
      if (!r.ok) {
        toast(r.detail || t('send_error'), 'error');
        return;
      }
      await loadSavedRoutes();
    }
    toast('✓ ' + t('push_saved'), 'success');
    navigation.goBack();
  };

  const deleteRoute = async (id) => {
    const before = savedRoutes;
    setSavedRoutes((prev) => prev.filter((x) => String(x.id) !== String(id)));
    const r = await marketAPI.deleteSavedRoute(id);
    if (!r.ok) {
      setSavedRoutes(before);
      toast(t('send_error'), 'error');
    }
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: v1.bg }]} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[s.backBtn, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[s.backText, { color: theme.text }]}>‹</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Feather name="bell" size={20} color={theme.text} />
          <Text style={[s.title, { color: theme.text }]}>{t('push_title')}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Категории уведомлений */}
        <Text style={[s.sectionTitle, { color: theme.text }]}>{t('push_categories')}</Text>
        {NOTIF_CATEGORIES.map(cat => (
          <View key={cat.key} style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Feather name={cat.icon} size={15} color={theme.text} />
                  <Text style={[s.label, { color: theme.text }]}>{t('push_cat_' + cat.key)}</Text>
                </View>
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
          <Text style={[s.label, { color: theme.text, marginBottom: 8 }]}>{label('route_direction', 'Направление')}</Text>
          <View style={s.routeInputs}>
            <TextInput style={[s.input, s.routeInput, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.border }]}
              placeholder={label('from', 'Откуда')} placeholderTextColor={theme.textMuted}
              value={fromCity} onChangeText={setFromCity} autoCapitalize="words" />
            <Feather name="arrow-right" size={18} color={theme.textMuted} />
            <TextInput style={[s.input, s.routeInput, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.border }]}
              placeholder={label('to', 'Куда')} placeholderTextColor={theme.textMuted}
              value={toCity} onChangeText={setToCity} autoCapitalize="words" />
          </View>
          <Text style={[s.desc, { color: theme.textMuted, marginTop: 8 }]}>
            {role === 'driver'
              ? label('push_route_driver_hint', 'Водитель получит push, когда появится новый груз по этому направлению.')
              : label('push_route_shipper_hint', 'Грузоотправитель сохранит нужное направление для поиска машин и заявок.')}
          </Text>
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

        <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={[s.row, { marginBottom: 8 }]}>
            <Text style={[s.label, { color: theme.text }]}>{label('saved_routes', 'Сохранённые маршруты')}</Text>
            {routesLoading ? <ActivityIndicator color={accent} /> : null}
          </View>
          {!routesLoading && savedRoutes.length === 0 ? (
            <Text style={[s.desc, { color: theme.textMuted }]}>{label('saved_routes_empty', 'Пока нет сохранённых маршрутов.')}</Text>
          ) : null}
          {savedRoutes.map((item) => (
            <View key={item.id} style={[s.savedRoute, { borderColor: theme.border, backgroundColor: theme.bg }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.savedRouteText, { color: theme.text }]} numberOfLines={1}>
                  {item.from_city || '—'} → {item.to_city || '—'}
                </Text>
                <Text style={[s.desc, { color: theme.textMuted }]} numberOfLines={1}>
                  {[item.truck_type, item.min_price ? `${item.min_price} USD+` : null].filter(Boolean).join(' · ') || label('push_any_cargo', 'Любой груз')}
                </Text>
              </View>
              <TouchableOpacity onPress={() => deleteRoute(item.id)} style={s.deleteRouteBtn} accessibilityLabel={label('delete', 'Удалить')}>
                <Feather name="trash-2" size={17} color={theme.textMuted} />
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <TouchableOpacity style={[s.saveBtn, { backgroundColor: accent }]} onPress={save} disabled={savingRoute}>
          {savingRoute ? <ActivityIndicator color="#0C0A09" /> : <Text style={s.saveBtnText}>{t('push_save_btn')}</Text>}
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
  routeInputs: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  routeInput: { flex: 1, minWidth: 0 },
  typesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  typeChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  typeChipText: { fontSize: 12, fontWeight: '600' },
  savedRoute: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 8 },
  savedRouteText: { fontSize: 13, fontWeight: '800' },
  deleteRouteBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  saveBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 14 },
  saveBtnText: { color: '#0C0A09', fontSize: 16, fontWeight: '800' },
});
