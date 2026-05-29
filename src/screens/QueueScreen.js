// QueueScreen — «Электронная очередь» КПП (центральный driver-таб, мастер-ТЗ §4).
//
// Расширяет существующий экран (не дубль): источник — backend
// GET /api/v1/borders/grouped (после backend-clearance отдаёт КПП из таблицы
// border_checkpoints, сгруппированные по стране-соседу).
//
// ЧЕСТНОСТЬ ПО §4.3: реальной интеграции CarGoRuqsat/qoldau ещё нет, поэтому
// очередь и позиция по госномеру показываются строго как pending-integration —
// НИКАКИХ выдуманных чисел/номеров. Бэкенд уже отдаёт queue_count/wait_time =
// null, queue_status = "pending-integration"; UI это честно отражает.
//
// Структура: виджет по госномеру (pending) → поиск → accordion по странам
// (🇨🇳🇷🇺🇺🇿🇰🇬🇹🇲) → карточки КПП → modal с деталями КПП.

import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, RefreshControl, ActivityIndicator, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '../utils/ThemeContext';
import { useI18n } from '../utils/useI18n';
import { useV1Colors } from '../theme/designV1';
import { API_BASE } from '../config/env';
import { regAPI } from '../utils/registration';

const DRIVER_ACCENT = '#00E676';

// Статус КПП → цвет/ключ. Пока в БД у всех 'unknown' → нейтральный серый.
const BORDER_STATUS = {
  open:    { color: '#22C55E', key: 'border_open' },
  closed:  { color: '#EF4444', key: 'border_closed' },
  limited: { color: '#F59E0B', key: 'border_limited' },
  unknown: { color: '#78716C', key: 'border_unknown' },
};

export default function QueueScreen({ navigation }) {
  const v1 = useV1Colors();
  const { theme } = useTheme();
  const { t } = useI18n();

  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState({});      // { CN: true }
  const [selected, setSelected] = useState(null);    // КПП для modal
  const [plate, setPlate] = useState(null);          // госномер из draft, если есть

  const fetchGrouped = async () => {
    setLoading(true);
    setError(false);
    try {
      const r = await fetch(`${API_BASE}/borders/grouped`);
      const data = await r.json();
      setGroups(Array.isArray(data?.groups) ? data.groups : []);
    } catch (e) {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  // Госномер — best-effort из draft/статуса регистрации. Если его нет —
  // нейтральный текст (§4.4: не подставлять фейковый госномер).
  const loadPlate = async () => {
    try {
      const st = await regAPI.status();
      const p = st?.vehicle_plate || st?.plate || st?.plate_number
        || st?.draft?.vehicle_plate || st?.draft?.plate || null;
      if (p) setPlate(String(p));
    } catch { /* нет токена/сети — оставляем нейтральный текст */ }
  };

  useEffect(() => { fetchGrouped(); loadPlate(); }, []);

  // Поиск — клиентский, чтобы не ломать группировку (§ frontend.2). Фильтруем
  // КПП внутри групп; пустые группы скрываем; при активном поиске
  // соответствующие страны авто-раскрываются.
  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map(g => ({
        ...g,
        crossings: g.crossings.filter(c =>
          (c.name || '').toLowerCase().includes(q) ||
          (c.name_en || '').toLowerCase().includes(q)
        ),
      }))
      .filter(g => g.crossings.length > 0);
  }, [groups, query]);

  const isExpanded = (code) => (query.trim() ? true : !!expanded[code]);
  const toggle = (code) => setExpanded(prev => ({ ...prev, [code]: !prev[code] }));

  const statusMeta = (s) => BORDER_STATUS[s] || BORDER_STATUS.unknown;

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: v1.bg }]} edges={['top']} testID="queue-screen">
      {/* Header */}
      <View style={s.header}>
        {navigation?.canGoBack?.() ? (
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} testID="queue-back">
            <Feather name="arrow-left" size={22} color={theme.text} />
          </TouchableOpacity>
        ) : <View style={s.backBtn} />}
        <Text style={[s.title, { color: theme.text }]}>🚦 {t('electronic_queue')}</Text>
        <View style={s.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchGrouped} tintColor={DRIVER_ACCENT} />}
      >
        {/* Виджет по госномеру — строго pending-integration */}
        <View style={[s.plateCard, { backgroundColor: theme.card, borderColor: theme.border }]} testID="queue-plate-widget">
          <View style={s.plateTop}>
            <Feather name="truck" size={18} color={DRIVER_ACCENT} />
            <Text style={[s.plateTitle, { color: theme.text }]}>{t('check_by_plate')}</Text>
          </View>
          <Text style={[s.plateValue, { color: plate ? theme.text : theme.textMuted }]}>
            {plate ? plate : t('plate_not_set')}
          </Text>
          <View style={s.pendingRow}>
            <View style={s.pendingDot} />
            <Text style={[s.pendingText, { color: theme.textMuted }]}>
              {t('queue_position_after_integration')}
            </Text>
          </View>
          <View style={s.pendingChip}>
            <Text style={s.pendingChipText}>pending-integration</Text>
          </View>
        </View>

        {/* Поиск */}
        <View style={[s.searchBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Feather name="search" size={18} color={theme.textMuted} />
          <TextInput
            style={[s.searchInput, { color: theme.text }]}
            placeholder={t('search_border_crossing')}
            placeholderTextColor={theme.textMuted}
            value={query}
            onChangeText={setQuery}
            testID="queue-search"
          />
          {query ? (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Feather name="x" size={18} color={theme.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        {loading && groups.length === 0 ? (
          <ActivityIndicator color={DRIVER_ACCENT} style={{ marginTop: 40 }} />
        ) : error ? (
          <Text style={[s.empty, { color: theme.textMuted }]}>{t('no_data')}</Text>
        ) : filteredGroups.length === 0 ? (
          <Text style={[s.empty, { color: theme.textMuted }]}>{t('no_crossings_found')}</Text>
        ) : (
          filteredGroups.map(g => {
            const open = isExpanded(g.country);
            return (
              <View key={g.country} style={[s.group, { borderColor: theme.border }]}>
                <TouchableOpacity
                  style={[s.groupHeader, { backgroundColor: theme.card }]}
                  onPress={() => toggle(g.country)}
                  activeOpacity={0.8}
                  testID={`queue-country-${g.country}`}
                >
                  <Text style={s.flag}>{g.flag}</Text>
                  <Text style={[s.groupName, { color: theme.text }]}>{g.name}</Text>
                  <View style={[s.countPill, { backgroundColor: DRIVER_ACCENT + '22' }]}>
                    <Text style={[s.countText, { color: DRIVER_ACCENT }]}>{g.crossings.length}</Text>
                  </View>
                  <Feather name={open ? 'chevron-up' : 'chevron-down'} size={20} color={theme.textMuted} />
                </TouchableOpacity>

                {open ? g.crossings.map(c => {
                  const st = statusMeta(c.border_status);
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}
                      onPress={() => setSelected(c)}
                      activeOpacity={0.85}
                      testID={`queue-crossing-${c.id}`}
                    >
                      <View style={s.cardTop}>
                        <Text style={[s.cardName, { color: theme.text }]}>{c.name}</Text>
                        <View style={[s.statusBadge, { backgroundColor: st.color + '22' }]}>
                          <View style={[s.statusDot, { backgroundColor: st.color }]} />
                          <Text style={[s.statusText, { color: st.color }]}>{t(st.key)}</Text>
                        </View>
                      </View>
                      <Text style={[s.cardMeta, { color: theme.textMuted }]}>
                        {c.countries} · {c.type || '—'} · {t('region')}: {c.region || '—'}
                      </Text>
                      <Text style={[s.cardMeta, { color: theme.textMuted }]}>
                        {t('work_hours')}: {c.work_hours || '—'}
                      </Text>
                      {/* Очередь — pending-integration, без цифр */}
                      <View style={s.queueRow}>
                        <View style={s.pendingDot} />
                        <Text style={[s.queueText, { color: theme.textMuted }]} numberOfLines={2}>
                          {t('queue_data_after_integration')}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                }) : null}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Detail modal */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: v1.bg, borderColor: theme.border }]} testID="queue-detail">
            {selected ? (() => {
              const st = statusMeta(selected.border_status);
              const Row = ({ label, value }) => (
                <View style={s.detailRow}>
                  <Text style={[s.detailLabel, { color: theme.textMuted }]}>{label}</Text>
                  <Text style={[s.detailValue, { color: theme.text }]}>{value || '—'}</Text>
                </View>
              );
              return (
                <>
                  <View style={s.modalHeader}>
                    <Text style={[s.modalTitle, { color: theme.text }]}>{selected.name}</Text>
                    <TouchableOpacity onPress={() => setSelected(null)} testID="queue-detail-close">
                      <Feather name="x" size={24} color={theme.textMuted} />
                    </TouchableOpacity>
                  </View>
                  <Text style={[s.detailSub, { color: theme.textMuted }]}>{t('crossing_details')}</Text>
                  <Row label={t('crossing_route')} value={selected.countries} />
                  <Row label={t('region')} value={selected.region} />
                  <Row label={t('work_hours')} value={selected.work_hours} />
                  <View style={s.detailRow}>
                    <Text style={[s.detailLabel, { color: theme.textMuted }]}>{t('border_status')}</Text>
                    <View style={[s.statusBadge, { backgroundColor: st.color + '22' }]}>
                      <View style={[s.statusDot, { backgroundColor: st.color }]} />
                      <Text style={[s.statusText, { color: st.color }]}>{t(st.key)}</Text>
                    </View>
                  </View>
                  {/* Очередь — pending-integration */}
                  <View style={[s.detailQueue, { borderColor: theme.border }]}>
                    <View style={s.pendingChip}>
                      <Text style={s.pendingChipText}>pending-integration</Text>
                    </View>
                    <Text style={[s.queueText, { color: theme.textMuted, marginTop: 8 }]}>
                      {t('queue_data_after_integration')}
                    </Text>
                  </View>
                </>
              );
            })() : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 6 },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '900', flex: 1, textAlign: 'center' },

  plateCard: { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 14 },
  plateTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  plateTitle: { fontSize: 14, fontWeight: '800' },
  plateValue: { fontSize: 22, fontWeight: '900', letterSpacing: 1, marginTop: 8 },
  pendingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 8 },
  pendingText: { fontSize: 12, flex: 1, lineHeight: 17 },
  pendingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#F59E0B', marginTop: 4 },
  pendingChip: { alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(245,158,11,0.14)' },
  pendingChipText: { fontSize: 10, fontWeight: '800', color: '#F59E0B', letterSpacing: 0.3 },

  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, height: 48, marginBottom: 14 },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },

  empty: { textAlign: 'center', marginTop: 40, fontSize: 14 },

  group: { borderRadius: 14, borderWidth: 1, marginBottom: 12, overflow: 'hidden' },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 14 },
  flag: { fontSize: 22 },
  groupName: { flex: 1, fontSize: 16, fontWeight: '800' },
  countPill: { minWidth: 26, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  countText: { fontSize: 13, fontWeight: '900' },

  card: { borderTopWidth: 1, padding: 14, gap: 6 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardName: { fontSize: 15, fontWeight: '800', flex: 1 },
  cardMeta: { fontSize: 12 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 11, fontWeight: '800' },
  queueRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 4 },
  queueText: { fontSize: 12, flex: 1, lineHeight: 17 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 20, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 20, fontWeight: '900', flex: 1 },
  detailSub: { fontSize: 12, marginTop: 2, marginBottom: 14 },
  detailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, gap: 12 },
  detailLabel: { fontSize: 13 },
  detailValue: { fontSize: 14, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  detailQueue: { marginTop: 12, paddingTop: 14, borderTopWidth: 1 },
});
