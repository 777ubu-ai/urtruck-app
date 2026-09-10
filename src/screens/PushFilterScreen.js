import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useV1Colors, v1Radius } from '../theme/designV1';
import { useI18n } from '../utils/useI18n';
import { useToast } from '../components/Toast';
import { getPushSettings, setPushSettings } from '../utils/store';
import { marketAPI } from '../utils/marketAPI';
import RoutePointPicker from '../components/RoutePointPicker';
import DatePicker from '../components/DatePicker';
import BottomSheet from '../components/ui/v1/BottomSheet';
import BellBadge from '../components/ui/v1/BellBadge';
import HeaderMenuButton from '../components/ui/v1/HeaderMenuButton';
import { searchCargoTypes } from '../utils/cargoTypes';
import { useUnreadNotifications } from '../utils/useUnreadNotifications';
import { useAuth } from '../utils/AuthContext';

const TRUCK_KEYS = ['tent', 'ref', 'platform', 'auto', 'izoterm', 'cont20', 'cont40', 'jumbo', 'curtain', 'lowloader', 'tanker', 'dumptruck'];
const COPY = {
  RU: { driver: 'Поиск грузов', shipper: 'Поиск машин', from: 'Откуда', to: 'Куда', load: 'Период загрузки', trip: 'Период рейса', weight: 'Минимальный вес', capacity: 'Грузоподъёмность от', cargo: 'Тип груза', truck: 'Тип кузова', chooseCargo: 'Выбрать тип груза', chooseTruck: 'Выбрать тип кузова', save: 'Сохранить маршрут', clear: 'Очистить период', place: 'Выберите страну и город', saved: 'Уведомления включены' },
  ZH: { driver: '寻找货物', shipper: '寻找车辆', from: '出发地', to: '目的地', load: '装货日期', trip: '行程日期', weight: '最低重量', capacity: '载重从', cargo: '货物类型', truck: '车身类型', chooseCargo: '选择货物类型', chooseTruck: '选择车身类型', save: '保存路线', clear: '清除日期', place: '选择国家和城市', saved: '通知已开启' },
  EN: { driver: 'Search cargo', shipper: 'Search trucks', from: 'From', to: 'To', load: 'Loading period', trip: 'Trip period', weight: 'Minimum weight', capacity: 'Capacity from', cargo: 'Cargo type', truck: 'Body type', chooseCargo: 'Choose cargo type', chooseTruck: 'Choose body type', save: 'Save route', clear: 'Clear period', place: 'Choose country and city', saved: 'Notifications enabled' },
};

export default function PushFilterScreen({ navigation, route }) {
  const c = useV1Colors(); const { t, lang } = useI18n(); const { toast } = useToast(); const { hasToken } = useAuth();
  const role = route?.params?.role || 'client'; const l = COPY[lang] || COPY.EN; const initial = getPushSettings();
  const [fromText, setFromText] = useState(initial.fromCity || ''); const [toText, setToText] = useState(initial.toCity || '');
  const [fromPoint, setFromPoint] = useState(initial.fromPoint); const [toPoint, setToPoint] = useState(initial.toPoint);
  const [start, setStart] = useState(initial.periodStart || ''); const [end, setEnd] = useState(initial.periodEnd || ''); const [weight, setWeight] = useState(initial.minTons || '');
  const [truck, setTruck] = useState(initial.truckType || ''); const [cargo, setCargo] = useState(initial.cargoType || ''); const [sheet, setSheet] = useState(null); const [saving, setSaving] = useState(false);
  const unread = useUnreadNotifications(hasToken); const cargoTypes = useMemo(() => searchCargoTypes('', lang).slice(0, 30), [lang]);
  useEffect(() => { marketAPI.listSavedRoutes().catch(() => {}); }, []);
  const pointCard = (label, text, setText, setPoint, key) => <View style={[s.card, { backgroundColor: c.surface, borderColor: c.border }]}><Text style={[s.label, { color: c.text }]}>{label}</Text><TouchableOpacity style={s.row} onPress={() => setSheet(key)}><Feather name="map-pin" size={17} color={c.driver} /><Text style={[s.value, { color: text ? c.text : c.placeholder }]}>{text || l.place}</Text><Feather name="chevron-right" size={18} color={c.textMuted} /></TouchableOpacity></View>;
  const save = async () => { const n = Number(String(weight).replace(',', '.')); if (!fromText || !toText || !Number.isFinite(n) || n < 0) { toast('Заполните маршрут и корректный вес', 'error'); return; } setSaving(true); setPushSettings({ fromCity: fromText, toCity: toText, fromPoint, toPoint, periodStart: start, periodEnd: end, minTons: String(n), truckType: truck, cargoType: cargo, categories: ['new_cargos'] }); const r = await marketAPI.saveRoute({ from_city: fromText, to_city: toText, truck_type: truck || null, notify: true }); setSaving(false); if (!r.ok) { toast(r.detail || t('send_error'), 'error'); return; } toast('✓ ' + l.saved, 'success'); navigation.goBack(); };
  const options = (kind, title, items, value, setter) => <BottomSheet visible={sheet === kind} onClose={() => setSheet(null)} title={title}>{items.map(x => <TouchableOpacity key={x.key || x.name} style={s.option} onPress={() => { setter(x.key || x.name); setSheet(null); }}><Text style={[s.optionText, { color: c.text }]}>{x.label || x.name}</Text>{value === (x.key || x.name) && <Feather name="check" size={18} color={c.driver} />}</TouchableOpacity>)}</BottomSheet>;
  return <SafeAreaView style={[s.container, { backgroundColor: c.bg }]} edges={['top']}><View style={s.header}><BellBadge count={unread} onPress={() => navigation.navigate('Notifications')} /><Text style={[s.title, { color: c.text }]}>{role === 'driver' ? l.driver : l.shipper}</Text><HeaderMenuButton navigation={navigation} role={role} /></View><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    {pointCard(l.from, fromText, setFromText, setFromPoint, 'from')}{pointCard(l.to, toText, setToText, setToPoint, 'to')}
    <View style={[s.card, { backgroundColor: c.surface, borderColor: c.border }]}><Text style={[s.label, { color: c.text }]}>{role === 'driver' ? l.load : l.trip}</Text><View style={s.dates}><DatePicker value={start} onChange={setStart} placeholder="DD.MM.YYYY" style={s.date} /><Text style={{ color: c.textMuted }}>→</Text><DatePicker value={end} onChange={setEnd} placeholder="DD.MM.YYYY" style={s.date} /></View><TouchableOpacity onPress={() => { setStart(''); setEnd(''); }}><Text style={[s.clear, { color: c.driver }]}>{l.clear}</Text></TouchableOpacity></View>
    <View style={[s.card, { backgroundColor: c.surface, borderColor: c.border }]}><Text style={[s.label, { color: c.text }]}>{role === 'driver' ? l.weight : l.capacity}</Text><TextInput value={weight} onChangeText={v => setWeight(v.replace(/[^0-9.,]/g, ''))} keyboardType="decimal-pad" placeholder="10" placeholderTextColor={c.placeholder} style={[s.input, { color: c.text, backgroundColor: c.bg, borderColor: c.border }]} /></View>
    {role === 'driver' && <TouchableOpacity style={[s.card, s.select, { backgroundColor: c.surface, borderColor: c.border }]} onPress={() => setSheet('cargo')}><View><Text style={[s.label, { color: c.text }]}>{l.cargo}</Text><Text style={[s.value, { color: cargo ? c.text : c.textMuted }]}>{cargo || l.chooseCargo}</Text></View><Feather name="chevron-right" size={18} color={c.textMuted} /></TouchableOpacity>}
    <TouchableOpacity style={[s.card, s.select, { backgroundColor: c.surface, borderColor: c.border }]} onPress={() => setSheet('truck')}><View><Text style={[s.label, { color: c.text }]}>{l.truck}</Text><Text style={[s.value, { color: truck ? c.text : c.textMuted }]}>{truck ? t(truck) : l.chooseTruck}</Text></View><Feather name="chevron-right" size={18} color={c.textMuted} /></TouchableOpacity>
    <TouchableOpacity style={[s.save, { backgroundColor: c.driver }]} onPress={save} disabled={saving}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveText}>{l.save}</Text>}</TouchableOpacity>
  </ScrollView><BottomSheet visible={sheet === 'from' || sheet === 'to'} onClose={() => setSheet(null)} title={sheet === 'from' ? l.from : l.to}><RoutePointPicker onChange={(v, p) => { if (sheet === 'from') { setFromText(v); setFromPoint(p); } else { setToText(v); setToPoint(p); } setSheet(null); }} /></BottomSheet>{options('cargo', l.cargo, cargoTypes, cargo, setCargo)}{options('truck', l.truck, TRUCK_KEYS.map(key => ({ key, label: t(key) })), truck, setTruck)}</SafeAreaView>;
}
const s = StyleSheet.create({ container: { flex: 1 }, header: { height: 64, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, title: { fontSize: 19, fontWeight: '800' }, content: { padding: 16, gap: 10, paddingBottom: 36 }, card: { borderWidth: 1, borderRadius: v1Radius.card, padding: 14 }, label: { fontSize: 13, fontWeight: '800', marginBottom: 9 }, row: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 28 }, value: { flex: 1, fontSize: 14, fontWeight: '600' }, dates: { flexDirection: 'row', alignItems: 'center', gap: 8 }, date: { flex: 1 }, clear: { fontSize: 12, fontWeight: '700', marginTop: 3 }, input: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 15 }, select: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, save: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 4 }, saveText: { color: '#fff', fontSize: 16, fontWeight: '800' }, option: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#E5ECE8' }, optionText: { fontSize: 15, fontWeight: '600' } });
