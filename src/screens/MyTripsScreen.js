import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Platform, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import { useToast } from '../components/Toast';
import { marketAPI } from '../utils/marketAPI';
import EmptyState from '../components/ui/EmptyState';
import { colors, spacing, radius, typography } from '../theme/theme';

export default function MyTripsScreen({ navigation, route }) {
  const { role } = route.params || {};
  const isDriver = role === 'driver';
  const accent = isDriver ? '#4F46E5' : '#F59E0B';
  const { t } = useI18n();
  const { theme } = useTheme();
  const { toast } = useToast();

  const initialTab = route.params?.initialTab || 'my';
  const justCreatedTrip = route.params?.justCreatedTrip || null;
  const [tab, setTab] = useState(initialTab);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(!justCreatedTrip);

  const load = async () => {
    setLoading(true);
    try {
      // Try dashboard first; skip if guest/no token
      const token = await require('../utils/storage').storage.get('ur_reg_token');
      if (!token) {
        // Guest — no /market/my, use public list
        if (isDriver) {
          const trips = await marketAPI.listTrips({});
          setData({ my_trips: trips.trips || [], my_cargos: [], my_bids: [], incoming_bids: [], my_deals: [], authRequired: true });
        } else {
          setData({ my_trips: [], my_cargos: [], my_bids: [], incoming_bids: [], my_deals: [], authRequired: true });
        }
      } else {
        let d = await marketAPI.myDashboard();
        if (d.serverError && isDriver) {
          try {
            const trips = await marketAPI.listTrips({});
            d = { ...d, my_trips: (trips.trips || []) };
          } catch {}
        }
        setData(d);
      }
    } catch (e) {
      console.warn('[MyTrips] load error:', e.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (justCreatedTrip) {
      // justCreatedTrip: show immediately, NO /market/my call at all
      setData({ my_trips: [justCreatedTrip], my_cargos: [], my_bids: [], incoming_bids: [], my_deals: [] });
      setLoading(false);
    } else {
      load();
    }
  }, []);

  // Merge justCreatedTrip if dashboard didn't return it
  let myItems = isDriver ? (data?.my_trips || []) : (data?.my_cargos || []);
  if (justCreatedTrip && isDriver && !myItems.find(i => i.id === justCreatedTrip.id)) {
    myItems = [justCreatedTrip, ...myItems];
  }
  const myBids = isDriver ? (data?.my_bids || []) : (data?.incoming_bids || []);
  const myDeals = data?.my_deals || [];

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

  const renderDeal = ({ item }) => {
    const statusColors = { accepted: '#22C55E', in_progress: '#3B82F6', delivered: '#22C55E', cancelled: '#EF4444' };
    const statusLabels = { accepted: '🤝 Согласовано', in_progress: '🚛 В пути', delivered: '✅ Доставлен', cancelled: '❌ Отменён' };
    return (
      <View style={[s.card, { backgroundColor: theme.card, borderColor: (statusColors[item.status] || theme.border), borderWidth: 2 }]}>
        <View style={s.cardTop}>
          <Text style={[s.route, { color: theme.text }]}>{item.from_city} → {item.to_city}</Text>
          <View style={[s.statusPill, { backgroundColor: (statusColors[item.status] || '#78716C') + '20' }]}>
            <Text style={[s.statusText, { color: statusColors[item.status] || '#78716C' }]}>{statusLabels[item.status] || item.status}</Text>
          </View>
        </View>
        <View style={s.cardBottom}>
          <Text style={[s.price, { color: '#22C55E' }]}>${item.amount}</Text>
          <Text style={[s.date, { color: theme.textDim }]}>{(item.created_at || '').slice(0, 10)}</Text>
        </View>
        {item.chat_room_id && (
          <TouchableOpacity
            style={[s.acceptBtn, { backgroundColor: '#3B82F6' }]}
            onPress={() => navigation.navigate('Chat', { roomId: item.chat_room_id, role })}
          >
            <Text style={s.acceptBtnText}>💬 Открыть чат</Text>
          </TouchableOpacity>
        )}
      </View>
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
        <Text style={[s.headerTitle, { color: theme.text }]}>Моя работа</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Tabs */}
      <View style={[s.tabs, { backgroundColor: theme.card }]}>
        <TouchableOpacity
          style={[s.tab, tab === 'my' && { backgroundColor: accent }]}
          onPress={() => setTab('my')}
        >
          <Text style={[s.tabText, { color: tab === 'my' ? '#FFF' : theme.textMuted }]}>
            {isDriver ? 'Мои рейсы' : 'Мои грузы'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tab, tab === 'bids' && { backgroundColor: accent }]}
          onPress={() => setTab('bids')}
        >
          <Text style={[s.tabText, { color: tab === 'bids' ? '#FFF' : theme.textMuted }]}>
            {isDriver ? 'Мои ставки' : 'Отклики'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tab, tab === 'deals' && { backgroundColor: '#22C55E' }]}
          onPress={() => setTab('deals')}
        >
          <Text style={[s.tabText, { color: tab === 'deals' ? '#FFF' : theme.textMuted }]}>Заказы</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={tab === 'deals' ? myDeals : tab === 'my' ? myItems : myBids}
        keyExtractor={i => i.id}
        renderItem={tab === 'deals' ? renderDeal : tab === 'my' ? renderMyItem : renderBid}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={
          data?.authRequired ? (
            <EmptyState
              title="Войдите, чтобы продолжить"
              description="Регистрация нужна для сделок, ставок, чата и контактов."
              actionLabel="Войти"
              onAction={() => navigation.navigate('Role')}
            />
          ) : tab === 'my' ? (
            <EmptyState
              title={isDriver ? 'Пока нет рейсов' : 'Пока нет грузов'}
              description={isDriver ? 'Опубликуйте маршрут, чтобы грузоотправители предложили груз.' : 'Создайте груз, чтобы получить отклики от водителей.'}
              actionLabel={isDriver ? 'Опубликовать маршрут' : 'Создать груз'}
              onAction={() => navigation.navigate('Feed', { role })}
            />
          ) : tab === 'bids' ? (
            <EmptyState
              title={isDriver ? 'Пока нет ставок' : 'Пока нет откликов'}
              description={isDriver ? 'Найдите подходящий груз и предложите цену.' : 'Отклики появятся после публикации груза.'}
              actionLabel={isDriver ? 'Найти грузы' : 'Создать груз'}
              onAction={() => navigation.navigate('Feed', { role })}
            />
          ) : (
            <EmptyState
              title="Пока нет заказов"
              description="Заказы появятся после подтверждения ставки или перевозки."
            />
          )
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
  tabs: { flexDirection: 'row', marginHorizontal: spacing.lg, borderRadius: radius.sm, padding: 3, marginBottom: spacing.sm, backgroundColor: colors.surface },
  tab: { flex: 1, paddingVertical: spacing.sm, borderRadius: 8, alignItems: 'center' },
  tabText: { ...typography.caption },
  card: { borderRadius: radius.md, padding: spacing.md, borderWidth: 1, marginBottom: spacing.sm, borderColor: colors.border, backgroundColor: colors.surface },
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
