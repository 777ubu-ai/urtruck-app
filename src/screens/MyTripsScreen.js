import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Platform, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import { useToast } from '../components/Toast';
import { marketAPI } from '../utils/marketAPI';

export default function MyTripsScreen({ navigation, route }) {
  const { role } = route.params || {};
  const isDriver = role === 'driver';
  const accent = isDriver ? '#4F46E5' : '#F59E0B';
  const { t } = useI18n();
  const { theme } = useTheme();
  const { toast } = useToast();

  const [tab, setTab] = useState('my'); // my | bids
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const d = await marketAPI.myDashboard();
      setData(d);
    } catch (e) {
      toast(t('load_error'), 'error');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const myItems = isDriver ? (data?.my_trips || []) : (data?.my_cargos || []);
  const myBids = isDriver ? (data?.my_bids || []) : (data?.incoming_bids || []);

  const renderMyItem = ({ item }) => {
    const from = item.from_city || '—';
    const to = item.to_city || '—';
    const desc = item.cargo_desc || item.truck_type || '';
    const price = item.price || 0;
    const status = item.status || 'active';
    const statusColors = { active: '#22C55E', taken: '#F59E0B', cancelled: '#EF4444', completed: '#78716C' };

    return (
      <TouchableOpacity
        style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}
        onPress={() => {
          if (item.cargo_desc) navigation.navigate('CargoDetail', { cargo: { ...item, from, to, cargo: desc, _server: true }, role });
        }}
      >
        <View style={s.cardTop}>
          <Text style={[s.route, { color: theme.text }]}>{from} → {to}</Text>
          <View style={[s.statusPill, { backgroundColor: (statusColors[status] || '#78716C') + '20' }]}>
            <Text style={[s.statusText, { color: statusColors[status] || '#78716C' }]}>{status}</Text>
          </View>
        </View>
        <Text style={[s.desc, { color: theme.textMuted }]}>{desc}</Text>
        <View style={s.cardBottom}>
          <Text style={[s.price, { color: accent }]}>${price}</Text>
          {item.bids_count > 0 && <Text style={[s.bids, { color: theme.textMuted }]}>{item.bids_count} ставок</Text>}
          <Text style={[s.date, { color: theme.textDim }]}>{(item.created_at || '').slice(0, 10)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderBid = ({ item }) => {
    const from = item.cargo_from || '—';
    const to = item.cargo_to || '—';
    const desc = item.cargo_desc || '';
    const statusColors = { pending: '#F59E0B', accepted: '#22C55E', rejected: '#EF4444' };

    return (
      <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={s.cardTop}>
          <Text style={[s.route, { color: theme.text }]}>{from} → {to}</Text>
          <View style={[s.statusPill, { backgroundColor: (statusColors[item.status] || '#78716C') + '20' }]}>
            <Text style={[s.statusText, { color: statusColors[item.status] || '#78716C' }]}>
              {item.status === 'accepted' ? '✅ Принято' : item.status === 'rejected' ? '❌ Отклонено' : '⏳ Ожидание'}
            </Text>
          </View>
        </View>
        <Text style={[s.desc, { color: theme.textMuted }]}>{desc}</Text>
        <View style={s.cardBottom}>
          <Text style={[s.price, { color: accent }]}>${item.amount}</Text>
          {item.message && <Text style={[s.bids, { color: theme.textMuted }]}>{item.message}</Text>}
          <Text style={[s.date, { color: theme.textDim }]}>{(item.created_at || '').slice(0, 10)}</Text>
        </View>
        {/* Кнопка Accept для владельца груза (входящие) */}
        {!isDriver && item.status === 'pending' && (
          <TouchableOpacity
            style={[s.acceptBtn, { backgroundColor: '#22C55E' }]}
            onPress={async () => {
              const r = await marketAPI.acceptBid(item.id);
              if (r.ok) { toast('✅ Ставка принята', 'success'); load(); }
              else toast(r.detail || t('send_error'), 'error');
            }}
          >
            <Text style={s.acceptBtnText}>✓ Принять ${item.amount}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: theme.bg }]} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
          <Text style={[s.backText, { color: theme.text }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: theme.text }]}>
          {isDriver ? '🚛 Мои рейсы' : '📦 Мои грузы'}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Tabs */}
      <View style={[s.tabs, { backgroundColor: theme.card }]}>
        <TouchableOpacity
          style={[s.tab, tab === 'my' && { backgroundColor: accent }]}
          onPress={() => setTab('my')}
        >
          <Text style={[s.tabText, { color: tab === 'my' ? '#FFF' : theme.textMuted }]}>
            {isDriver ? 'Мои рейсы' : 'Мои грузы'} ({myItems.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tab, tab === 'bids' && { backgroundColor: accent }]}
          onPress={() => setTab('bids')}
        >
          <Text style={[s.tabText, { color: tab === 'bids' ? '#FFF' : theme.textMuted }]}>
            {isDriver ? 'Мои ставки' : 'Входящие ставки'} ({myBids.length})
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={tab === 'my' ? myItems : myBids}
        keyExtractor={i => i.id}
        renderItem={tab === 'my' ? renderMyItem : renderBid}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={
          <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: 40, fontSize: 14 }}>
            {tab === 'my'
              ? (isDriver ? 'У вас пока нет рейсов. Опубликуйте первый!' : 'У вас пока нет грузов.')
              : (isDriver ? 'Вы пока не делали ставок.' : 'Пока нет входящих предложений.')}
          </Text>
        }
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 8,
  },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 30, fontWeight: '300' },
  headerTitle: { fontSize: 17, fontWeight: '800' },
  tabs: { flexDirection: 'row', marginHorizontal: 16, borderRadius: 12, padding: 4, marginBottom: 8 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  tabText: { fontSize: 12, fontWeight: '700' },
  card: { borderRadius: 14, padding: 14, borderWidth: 1, marginBottom: 10 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  route: { fontSize: 15, fontWeight: '800' },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: '700' },
  desc: { fontSize: 13, marginBottom: 8 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  price: { fontSize: 18, fontWeight: '900' },
  bids: { fontSize: 11, flex: 1 },
  date: { fontSize: 10 },
  acceptBtn: { marginTop: 10, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  acceptBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
});
