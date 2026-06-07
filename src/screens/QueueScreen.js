import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../utils/ThemeContext';
import { useI18n } from '../utils/useI18n';
import {v1Colors, useV1Colors} from '../theme/designV1';
import { API_BASE } from '../config/env';
import { regAPI } from '../utils/registration';

const BASE = `${API_BASE}/borders`;

const STATUS_COLORS = { green: '#22C55E', yellow: '#F59E0B', red: '#EF4444' };
// Метки статуса локализованы через t() в рендере (statusLabel) — раньше были
// хардкод-RU и протекали в ZH/EN/KZ.
const STATUS_KEY = { green: 'queue_status_free', yellow: 'queue_status_moderate', red: 'queue_status_busy' };

export default function QueueScreen({ navigation }) {
  const v1 = useV1Colors();
  const { theme } = useTheme();
  const { t } = useI18n();
  const [borders, setBorders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  // Progressive verification gate: электронная очередь — trust-функция,
  // доступна только одобренному водителю. Источник статуса — regAPI.me()
  // (как VerificationStatusBanner): { status, verification_level }.
  // verState: 'loading' | 'approved' | 'review' | 'rejected' | 'unverified'.
  const [verState, setVerState] = useState('loading');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const me = await regAPI.me();
        if (!alive) return;
        if (me && (me.status === 'approved' || me.verification_level >= 3)) setVerState('approved');
        else if (me && (me.status === 'pending' || me.status === 'under_review' || me.status === 'manual_review')) setVerState('review');
        else if (me && me.status === 'rejected') setVerState('rejected');
        else setVerState('unverified');
      } catch {
        if (alive) setVerState('unverified'); // не подтвердили approved → гейтим (без fake-approved)
      }
    })();
    return () => { alive = false; };
  }, []);

  const fetchBorders = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}?country=${filter}`);
      const data = await r.json();
      setBorders(data.borders || []);
    } catch (e) {
      console.warn('Borders fetch failed:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBorders(); }, [filter]);

  const FILTERS = [
    { k: '', l: t('filter_all') },
    { k: 'CN', l: `🇨🇳 ${t('queue_country_cn')}` },
    { k: 'RU', l: `🇷🇺 ${t('queue_country_ru')}` },
    { k: 'UZ', l: `🇺🇿 ${t('queue_country_uz')}` },
    { k: 'KG', l: `🇰🇬 ${t('queue_country_kg')}` },
  ];

  // Не одобрен → locked/promo состояние очереди (вместо полного функционала).
  if (verState !== 'approved') {
    // IA cleanup: Queue-гейт больше НЕ ведёт в driver-score (Security).
    // pending — статус документов показывается на месте (без кнопки в score);
    // unverified/rejected → документная проверка (Identity). Везде вторичная
    // ссылка ведёт в CarGoRuqsat hub (CargoRuqsatInfo), а не в «Мой статус».
    const gate = verState === 'review'
      ? { title: t('queue_gate_pending_title'), text: t('queue_gate_pending_text'), btn: null, go: null }
      : verState === 'rejected'
        ? { title: t('queue_gate_rejected_title'), text: t('queue_gate_rejected_text'), btn: t('queue_gate_rejected_btn'), go: 'Identity' }
        : { title: t('queue_gate_locked_title'), text: t('queue_gate_locked_text'), btn: t('queue_gate_locked_btn'), go: 'Identity' };
    return (
      <SafeAreaView style={[{ flex: 1, backgroundColor: v1.bg }]} edges={['top']} testID="queue-gate">
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
            <Text style={[s.backText, { color: theme.text }]}>‹</Text>
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: theme.text }]}>{t('border_queues_title')}</Text>
          <View style={{ width: 44 }} />
        </View>
        {verState === 'loading' ? (
          <ActivityIndicator color="#1A5C3C" style={{ marginTop: 60 }} />
        ) : (
          <View style={s.gateWrap}>
            <Text style={s.gateIcon}>🔒</Text>
            <Text style={[s.gateTitle, { color: theme.text }]}>{gate.title}</Text>
            <Text style={[s.gateText, { color: theme.textMuted }]}>{gate.text}</Text>
            {gate.btn && gate.go ? (
              <TouchableOpacity
                style={s.gateBtn}
                onPress={() => navigation.navigate(gate.go)}
                testID="queue-gate-cta"
              >
                <Text style={s.gateBtnText}>{gate.btn}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={s.gateSecondary} onPress={() => navigation.navigate('CargoRuqsatInfo')} testID="queue-cgr-link">
              <Text style={[s.gateSecondaryText, { color: theme.textMuted }]}>{t('queue_cgr_cta')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: v1.bg }]} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
          <Text style={[s.backText, { color: theme.text }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: theme.text }]}>{t('border_queues_title')}</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* IA: Queue — единый hub электронной очереди. CarGoRuqsat (портал,
          привязка брони, мои брони) живёт в CargoRuqsatInfo; здесь — вход. */}
      <TouchableOpacity style={s.cgrLink} onPress={() => navigation.navigate('CargoRuqsatInfo')} testID="queue-cgr-link-approved">
        <Text style={s.cgrLinkText}>🅿️ {t('queue_cgr_cta')}</Text>
        <Text style={[s.cgrLinkChevron, { color: theme.textMuted }]}>›</Text>
      </TouchableOpacity>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.k}
            style={[s.chip, { backgroundColor: filter === f.k ? '#1A5C3C' : theme.card, borderColor: theme.border }]}
            onPress={() => setFilter(f.k)}
          >
            <Text style={[s.chipText, { color: filter === f.k ? '#FFF' : theme.textMuted }]}>{f.l}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchBorders} />}
      >
        {loading && borders.length === 0 && <ActivityIndicator color="#1A5C3C" style={{ marginTop: 40 }} />}

        {borders.map(b => {
          const col = STATUS_COLORS[b.status] || '#78716C';
          return (
            <View key={b.id} style={[s.card, { backgroundColor: theme.card, borderColor: theme.border, borderLeftColor: col, borderLeftWidth: 4 }]}>
              <View style={s.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.name, { color: theme.text }]}>{b.name}</Text>
                  <Text style={[s.countries, { color: theme.textMuted }]}>{b.countries} · {b.type}</Text>
                </View>
                <View style={[s.statusBadge, { backgroundColor: col + '20' }]}>
                  <View style={[s.statusDot, { backgroundColor: col }]} />
                  <Text style={[s.statusText, { color: col }]}>{t(STATUS_KEY[b.status] || 'queue_status_moderate')}</Text>
                </View>
              </View>

              <View style={s.stats}>
                <View style={s.stat}>
                  <Text style={[s.statNum, { color: theme.text }]}>{b.trucks_in_queue}</Text>
                  <Text style={[s.statLabel, { color: theme.textMuted }]}>{t('vehicles_label')}</Text>
                </View>
                <View style={s.stat}>
                  <Text style={[s.statNum, { color: col }]}>{b.estimated_wait_hours}{t('cargoruqsat_live_hours_short')}</Text>
                  <Text style={[s.statLabel, { color: theme.textMuted }]}>{t('waiting_label')}</Text>
                </View>
                <View style={s.stat}>
                  <Text style={[s.statNum, { color: theme.textMuted, fontSize: 13 }]}>{b.name_en}</Text>
                  <Text style={[s.statLabel, { color: theme.textMuted }]}>EN</Text>
                </View>
              </View>

              <Text style={[s.updated, { color: theme.textDim }]}>
                {t('queue_updated')}: {(b.updated_at || '').slice(11, 16)} UTC
              </Text>
            </View>
          );
        })}

        {!loading && borders.length === 0 && (
          <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: 40 }}>{t('no_data')}</Text>
        )}
      </ScrollView>
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
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  chipText: { fontSize: 12, fontWeight: '700' },
  card: { borderRadius: 14, padding: 14, borderWidth: 1, marginBottom: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  name: { fontSize: 16, fontWeight: '800' },
  countries: { fontSize: 12, marginTop: 2 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '700' },
  stats: { flexDirection: 'row', gap: 20 },
  stat: { alignItems: 'center' },
  statNum: { fontSize: 20, fontWeight: '900' },
  statLabel: { fontSize: 10, marginTop: 2 },
  updated: { fontSize: 10, marginTop: 8, textAlign: 'right' },
  gateWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  gateIcon: { fontSize: 48, marginBottom: 16 },
  gateTitle: { fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 10 },
  gateText: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 24 },
  gateBtn: { height: 52, borderRadius: 14, backgroundColor: '#1A5C3C', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, minWidth: 220 },
  gateBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  gateSecondary: { marginTop: 12, paddingVertical: 8 },
  gateSecondaryText: { fontSize: 13, fontWeight: '600' },
  cgrLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#1A5C3C', backgroundColor: 'rgba(26,92,60,0.08)' },
  cgrLinkText: { fontSize: 14, fontWeight: '800', color: '#1A5C3C' },
  cgrLinkChevron: { fontSize: 20, fontWeight: '300' },
});
