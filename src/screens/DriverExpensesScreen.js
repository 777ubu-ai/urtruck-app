import React, { useCallback, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, FlatList, ScrollView, Modal, ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Feather from '@expo/vector-icons/Feather';
import { useAuth } from '../utils/AuthContext';
import { useI18n } from '../utils/useI18n';
import { useV1Colors } from '../theme/designV1';
import { expenseAPI } from '../utils/expenseAPI';
import { getExpenseCopy } from '../utils/expenseCopy';
import { EXPENSE_CATEGORIES, EXPENSE_CURRENCIES, localExpenseDate, newExpenseClientId, makeExpenseBody, formatExpenseMoney } from '../utils/expenseModel';
import AppConfirmModal from '../components/ui/AppConfirmModal';

const dealLabel = (d) => [d?.from_city, d?.to_city].filter(Boolean).join(' → ');
export default function DriverExpensesScreen({ route, navigation }) {
  const { session } = useAuth();
  const { lang } = useI18n();
  const c = getExpenseCopy(lang);
  const colors = useV1Colors();
  const owner = session?.user?.id;
  const driver = session?.user?.role === 'driver';
  const fixedDeal = route?.params?.dealId || null;
  const viewKey = JSON.stringify([owner, fixedDeal, route?.key]);
  const [vehicleFilter, setVehicleFilter] = useState('');
  const [dealFilter, setDealFilter] = useState(fixedDeal || '');
  const [data, setData] = useState({ owner: null, expenses: [], vehicles: [], deals: [], totals: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState(null);
  const [chooser, setChooser] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const scope = useRef(0);
  const choiceScope = useRef(0);
  const busyRef = useRef(false);
  const clientId = useRef(null);
  const filterKey = JSON.stringify([viewKey, vehicleFilter, fixedDeal || dealFilter]);
  const page = data.owner === owner && data.filterKey === filterKey ? data : { expenses: [], vehicles: [], deals: [], totals: [], total: 0 };
  const activeForm = form?.owner === owner ? form : null;
  const money = (item) => formatExpenseMoney(item.amount, item.currency, lang);
  const failure = (result, saving = false) => result?.status === 409 ? c.conflict
    : [404, 503].includes(result?.status) ? c.unavailable : saving ? c.saveError : c.error;

  const load = useCallback(async (append = false) => {
    if (!owner || !driver) return;
    const epoch = ++scope.current;
    setLoading(true); setError('');
    const offset = append && data.owner === owner && data.filterKey === filterKey ? data.expenses.length : 0;
    const cursor = append ? data.next_cursor : null;
    const [options, result] = await Promise.all([
      expenseAPI.options(fixedDeal || dealFilter),
      expenseAPI.list({ deal_id: fixedDeal || dealFilter, vehicle_id: vehicleFilter, ...(cursor ? { cursor } : { offset }) }),
    ]);
    if (epoch !== scope.current || result?.stale || options?.stale) return;
    setLoading(false);
    if (!result?.ok || !options?.ok) { setError(failure(!options?.ok ? options : result)); return; }
    setData(previous => ({ owner, filterKey, vehicles: options.vehicles, deals: options.deals,
      expenses: offset && previous.owner === owner && previous.filterKey === filterKey
        ? [...new Map([...previous.expenses, ...result.expenses].map(item => [item.id, item])).values()] : result.expenses,
      totals: result.totals, total: result.total, next_cursor: result.next_cursor }));
  // Data rows are deliberately excluded: storing a response must not refetch it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, driver, fixedDeal, dealFilter, vehicleFilter, lang, data.expenses.length, data.owner, data.filterKey, data.next_cursor, filterKey]);

  // Stable focus inputs prevent a data response from creating another request.
  const loadRef = useRef(load); loadRef.current = load;
  useFocusEffect(useCallback(() => {
    setForm(null); setChooser(null); setPendingDelete(null);
    loadRef.current(false);
    return () => { scope.current += 1; choiceScope.current += 1; };
  }, [owner, driver, fixedDeal, dealFilter, vehicleFilter, lang]));

  const startForm = (item = null) => {
    if (busyRef.current || loading || (data.owner !== owner || data.filterKey !== filterKey)) return;
    const selectedDeal = item ? item.deal_id : fixedDeal || dealFilter || null;
    const d = page.deals.find(value => value.id === selectedDeal);
    clientId.current = newExpenseClientId();
    setForm({ owner, id: item?.id, version: item?.version,
      amount: item?.amount || '', currency: item?.currency || 'KZT', category: item?.category || 'fuel',
      description: item?.description || '', spent_on: item?.spent_on || localExpenseDate(),
      deal_id: selectedDeal, deal_label: item?.deal_label || dealLabel(d),
      vehicle_id: item ? item.vehicle_id : d?.vehicle_id || vehicleFilter || null,
      vehicle_plate: item ? item.vehicle_plate : d?.vehicle_plate_snapshot || '' });
    setFormError('');
  };
  const change = (key, value) => setForm(old => old ? { ...old, [key]: value } : old);
  const save = async () => {
    if (!activeForm || busyRef.current) return;
    const body = makeExpenseBody(activeForm, clientId.current);
    if (!body) { setFormError(c.invalid); return; }
    const epoch = scope.current;
    busyRef.current = true; setBusy(true); setFormError('');
    try {
      const result = await expenseAPI.save(body, activeForm.id);
      if (epoch !== scope.current || result?.stale) return;
      if (!result?.ok) { setFormError(failure(result, true)); return; }
      setForm(null); await loadRef.current(false);
    } finally { busyRef.current = false; setBusy(false); }
  };
  const remove = async () => {
    if (!pendingDelete || pendingDelete._owner !== owner || busyRef.current) return;
    const epoch = scope.current;
    busyRef.current = true; setBusy(true);
    try {
      const result = await expenseAPI.remove(pendingDelete);
      if (epoch !== scope.current || result?.stale) return;
      setPendingDelete(null);
      if (!result?.ok) { setError(failure(result)); return; }
      await loadRef.current(false);
    } finally { busyRef.current = false; setBusy(false); }
  };
  const field = (label, value, onPress, testID) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={busy} testID={testID}
      style={[s.field, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Text style={[s.muted, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[s.value, { color: colors.text }]}>{value}</Text>
    </Pressable>
  );
  const vehicleName = (id, fallback) => id ? fallback || page.vehicles.find(v => v.id === id)?.license_plate || id : c.noVehicle;
  const tripName = (id, fallback) => id ? dealLabel(page.deals.find(d => d.id === id)) || fallback || id : c.noDeal;
  const closeChooser = () => { choiceScope.current += 1; setChooser(null); };
  const loadDeals = async (request, append = false) => {
    const epoch = ++choiceScope.current;
    const screenEpoch = scope.current;
    const q = request.q || '';
    setChooser(old => old && old.owner === request.owner && old.filterKey === request.filterKey
      ? { ...old, loading: true, error: '' } : old);
    const result = await expenseAPI.deals({ q, limit: 50, cursor: append ? request.next_cursor : null });
    if (epoch !== choiceScope.current || screenEpoch !== scope.current || result?.stale) return;
    setChooser(old => {
      if (!old || old.owner !== request.owner || old.filterKey !== request.filterKey) return old;
      if (!result?.ok) return { ...old, loading: false, error: failure(result) };
      const deals = [...new Map([...(append ? old.deals || [] : []), ...result.deals].map(d => [d.id, d])).values()];
      return { ...old, loading: false, error: '', deals, searched: q, next_cursor: result.next_cursor,
        entries: [{ id: '', label: old.inForm ? c.noDeal : c.allDeals },
          ...deals.map(d => ({ id: d.id, label: `${dealLabel(d)} · ${d.id.slice(0, 8)}` }))] };
    });
  };
  const choose = (type, inForm = false) => {
    let entries;
    if (type === 'currency') entries = EXPENSE_CURRENCIES.map(value => ({ id: value, label: value }));
    else if (type === 'vehicle') entries = [{ id: '', label: inForm ? c.noVehicle : c.allVehicles }, ...page.vehicles.map(v => ({ id: v.id, label: v.license_plate }))];
    else entries = [{ id: '', label: inForm ? c.noDeal : c.allDeals }];
    const request = { owner, filterKey, type, inForm, entries, deals: [], q: '', searched: '' };
    setChooser(request);
    if (type === 'deal') loadDeals(request);
  };
  const select = (id) => {
    if (!chooser || chooser.owner !== owner || chooser.filterKey !== filterKey) return;
    const selected = chooser.type === 'deal' ? chooser.deals?.find(d => d.id === id) : null;
    if (selected) setData(old => ({ ...old, deals: [...old.deals.filter(d => d.id !== id), selected] }));
    if (chooser.inForm) {
      if (chooser.type === 'currency') change('currency', id);
      else if (chooser.type === 'vehicle') setForm(old => ({ ...old, vehicle_id: id || null,
        vehicle_plate: page.vehicles.find(v => v.id === id)?.license_plate || '' }));
      else {
        const d = selected;
        setForm(old => ({ ...old, deal_id: id || null, deal_label: dealLabel(d),
          vehicle_id: d?.vehicle_id || null, vehicle_plate: d?.vehicle_plate_snapshot || '' }));
      }
    } else if (chooser.type === 'vehicle') setVehicleFilter(id);
    else setDealFilter(id);
    closeChooser();
  };
  const rowInput = (label, key, props = {}) => <View style={s.gap}>
    <Text style={[s.label, { color: colors.text }]}>{label}</Text>
    <TextInput value={activeForm?.[key] || ''} onChangeText={value => change(key, value)} editable={!busy}
      accessibilityLabel={label} testID={`expense-${key}`} placeholderTextColor={colors.textMuted}
      style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} {...props} />
  </View>;

  return <SafeAreaView style={[s.safe, { backgroundColor: colors.bg }]}>
    <View style={s.header}>
      <Pressable accessibilityRole="button" accessibilityLabel={c.close} disabled={busy} testID="expenses-back" style={s.icon}
        onPress={() => activeForm ? setForm(null) : navigation.goBack()}><Feather name="arrow-left" size={26} color={colors.text} /></Pressable>
      <Text style={[s.title, { color: colors.text }]}>{activeForm ? activeForm.id ? c.edit : c.add : fixedDeal ? c.tripTitle : c.title}</Text>
    </View>
    {!driver ? <Text style={[s.notice, { color: colors.text }]}>{c.driverOnly}</Text> : activeForm ? (
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          {field(c.deal, tripName(activeForm.deal_id, activeForm.deal_label), () => { if (!fixedDeal) choose('deal', true); }, 'expense-deal')}
          {field(c.vehicle, vehicleName(activeForm.vehicle_id, activeForm.vehicle_plate), () => {
            const d = page.deals.find(value => value.id === activeForm.deal_id);
            if (!d?.vehicle_id) choose('vehicle', true);
          }, 'expense-vehicle')}
          {rowInput(c.amount, 'amount', { keyboardType: 'decimal-pad', maxLength: 16 })}
          {field(c.currency, activeForm.currency, () => choose('currency', true), 'expense-currency')}
          {rowInput(c.date, 'spent_on', { maxLength: 10, autoCapitalize: 'none' })}
          <Text style={[s.label, { color: colors.text }]}>{c.category}</Text>
          <View style={s.chips}>{EXPENSE_CATEGORIES.map(key => <Pressable key={key} disabled={busy} accessibilityRole="button"
            accessibilityState={{ selected: activeForm.category === key }} testID={`expense-category-${key}`} onPress={() => change('category', key)}
            style={[s.chip, { borderColor: activeForm.category === key ? '#168759' : colors.border, backgroundColor: colors.surface }]}>
            <Text style={[s.value, { color: activeForm.category === key ? '#168759' : colors.text }]}>{c[key]}</Text></Pressable>)}</View>
          {rowInput(c.description, 'description', { multiline: true, maxLength: 500, placeholder: c.placeholder })}
          <Text style={[s.muted, { color: colors.textMuted }]}>{c.privacy}</Text>
          {!!formError && <Text accessibilityRole="alert" style={[s.notice, { color: colors.text }]}>{formError}</Text>}
          <Pressable disabled={busy} accessibilityRole="button" onPress={save} style={s.primary} testID="expense-save">
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.primaryText}>{c.save}</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    ) : <FlatList data={page.expenses} keyExtractor={item => item.id} contentContainerStyle={s.content}
      ListHeaderComponent={<View>
        <Text style={[s.muted, { color: colors.textMuted }]}>{c.privacy}</Text>
        {field(c.vehicle, vehicleFilter ? vehicleName(vehicleFilter) : c.allVehicles, () => choose('vehicle'), 'expenses-filter-vehicle')}
        {!fixedDeal && field(c.deal, dealFilter ? tripName(dealFilter) : c.allDeals, () => choose('deal'), 'expenses-filter-deal')}
        {!!fixedDeal && <Text style={[s.label, { color: colors.text }]}>{tripName(fixedDeal)}</Text>}
        <View style={[s.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Text style={[s.muted, { color: colors.textMuted }]}>{c.total}</Text>
          {page.totals.map(item => <Text key={item.currency} style={[s.total, { color: colors.text }]}>{money(item)}</Text>)}
        </View>
        <Pressable accessibilityRole="button" disabled={loading || busy || data.owner !== owner || data.filterKey !== filterKey} style={s.primary} onPress={() => startForm()} testID="expenses-add"><Text style={s.primaryText}>＋ {c.add}</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={loading} style={s.refresh} onPress={() => loadRef.current(false)} testID="expenses-refresh"><Text style={[s.value, { color: colors.text }]}>{c.retry}</Text></Pressable>
        {!!error && <Text accessibilityRole="alert" style={[s.notice, { color: colors.text }]}>{error}</Text>}
        {loading && <ActivityIndicator color="#168759" />}
      </View>}
      ListEmptyComponent={!loading && !error ? <Text style={[s.notice, { color: colors.textMuted }]}>{c.empty}</Text> : null}
      renderItem={({ item }) => <View style={[s.card, { borderColor: colors.border, backgroundColor: colors.surface }]} testID="expense-record">
        <View style={s.row}><Text style={[s.label, s.flex, { color: colors.text }]}>{c[item.category] || c.other}</Text><Text style={[s.value, { color: colors.text }]}>{money(item)}</Text></View>
        {!!item.description && <Text style={[s.value, { color: colors.text }]}>{item.description}</Text>}
        <Text style={[s.muted, { color: colors.textMuted }]}>{item.spent_on} · {item.vehicle_plate || c.noVehicle}</Text>
        {!!item.deal_label && <Text style={[s.muted, { color: colors.textMuted }]}>{item.deal_label}</Text>}
        <View style={s.row}><Pressable accessibilityRole="button" disabled={busy} style={s.refresh} onPress={() => startForm(item)}><Text style={[s.value, { color: colors.text }]}>{c.edit}</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={busy} style={s.refresh} onPress={() => setPendingDelete({ ...item, _owner: owner })}><Text style={[s.value, { color: colors.text }]}>{c.remove}</Text></Pressable></View>
      </View>}
      ListFooterComponent={page.expenses.length < page.total ? <Pressable accessibilityRole="button" disabled={loading} style={s.refresh} onPress={() => loadRef.current(true)}><Text style={[s.value, { color: colors.text }]}>{c.more}</Text></Pressable> : null} />}
    <Modal visible={!!chooser && chooser.owner === owner && chooser.filterKey === filterKey && driver} transparent animationType="fade" onRequestClose={closeChooser}>
      <SafeAreaView style={s.shade}><View style={[s.choiceCard, { backgroundColor: colors.surface }]}>
        <Pressable accessibilityRole="button" style={s.refresh} onPress={closeChooser}><Text style={[s.label, { color: colors.text }]}>{c.close}</Text></Pressable>
        {chooser?.type === 'deal' && <View>
          <TextInput testID="expenses-deal-search" accessibilityLabel={c.searchDeals} placeholder={c.searchDeals}
            placeholderTextColor={colors.textMuted} value={chooser.q} maxLength={100} autoCapitalize="none"
            style={[s.input, { color: colors.text, borderColor: colors.border }]}
            onChangeText={q => setChooser(old => old ? { ...old, q } : old)} onSubmitEditing={() => loadDeals(chooser)} />
          <Pressable testID="expenses-deal-search-submit" accessibilityRole="button" disabled={chooser.loading}
            style={s.refresh} onPress={() => loadDeals(chooser)}><Text style={[s.value, { color: colors.text }]}>{c.search}</Text></Pressable>
          {chooser.loading && <ActivityIndicator color={colors.text} />}
          {!!chooser.error && <Text accessibilityRole="alert" style={{ color: colors.text }}>{chooser.error}</Text>}
          {!!chooser.error && <Pressable accessibilityRole="button" onPress={() => loadDeals(chooser)} style={s.refresh}>
            <Text style={{ color: colors.text }}>{c.retry}</Text></Pressable>}
          {!chooser.loading && !chooser.error && chooser.searched && !chooser.deals?.length
            ? <Text style={{ color: colors.textMuted }}>{c.noDealsFound}</Text> : null}
        </View>}
        <FlatList data={chooser?.entries || []} keyExtractor={item => item.id || 'none'} renderItem={({ item }) => <Pressable accessibilityRole="button" style={s.choice} onPress={() => select(item.id)}><Text style={[s.value, { color: colors.text }]}>{item.label}</Text></Pressable>}
          ListFooterComponent={chooser?.type === 'deal' && chooser.next_cursor ? <Pressable
            testID="expenses-deals-more" accessibilityRole="button" style={s.refresh}
            disabled={chooser.loading || chooser.q !== chooser.searched} onPress={() => loadDeals(chooser, true)}>
            <Text style={{ color: colors.text }}>{c.more}</Text></Pressable> : null} />
      </View></SafeAreaView>
    </Modal>
    <AppConfirmModal visible={!!pendingDelete && pendingDelete._owner === owner && driver} title={c.removeTitle} message={c.removeMessage} cancelLabel={c.cancel} confirmLabel={c.remove}
      destructive onCancel={() => { if (!busy) setPendingDelete(null); }} onConfirm={remove} testID="expense-delete-confirm" />
  </SafeAreaView>;
}
const s = StyleSheet.create({
  safe: { flex: 1 }, flex: { flex: 1 }, header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  title: { fontSize: 21, fontWeight: '700', flexShrink: 1 }, icon: { padding: 10 }, content: { padding: 18, paddingBottom: 36, gap: 12 },
  label: { fontSize: 16, fontWeight: '600' }, value: { fontSize: 16 }, muted: { fontSize: 14, lineHeight: 20 },
  field: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 5, marginVertical: 6, minHeight: 62 }, gap: { gap: 8 },
  input: { borderWidth: 1, borderRadius: 14, padding: 14, fontSize: 18, minHeight: 52, textAlignVertical: 'top' },
  primary: { backgroundColor: '#168759', borderRadius: 14, minHeight: 50, alignItems: 'center', justifyContent: 'center', padding: 14, marginVertical: 8 },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 12, padding: 13, minWidth: '45%', flexGrow: 1, alignItems: 'center' },
  notice: { paddingVertical: 12, fontSize: 15, lineHeight: 22 }, card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 7, marginTop: 10 },
  total: { fontSize: 23, fontWeight: '700' }, row: { flexDirection: 'row', alignItems: 'center', gap: 10 }, refresh: { padding: 12, alignItems: 'center' },
  shade: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 20 },
  choiceCard: { maxHeight: '80%', borderRadius: 18, padding: 10, flexShrink: 1 }, choice: { padding: 16, minHeight: 50 },
});
