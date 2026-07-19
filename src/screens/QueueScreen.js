import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator, TextInput, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../utils/ThemeContext';
import { useI18n } from '../utils/useI18n';
import {v1Colors, useV1Colors} from '../theme/designV1';
import { API_BASE } from '../config/env';
import { regAPI } from '../utils/registration';
import { storage } from '../utils/storage';

const PLATE_KEY = 'ur_queue_plate';

const BASE = `${API_BASE}/borders`;

const STATUS_COLORS = { green: '#22C55E', yellow: '#FF8400', red: '#EF4444' };
// Метки статуса локализованы через t() в рендере (statusLabel) — раньше были
// хардкод-RU и протекали в ZH/EN/KZ.
const STATUS_KEY = { green: 'queue_status_free', yellow: 'queue_status_moderate', red: 'queue_status_busy' };
// Статусы строк табло (номер в очереди): цвет + i18n-ключ.
const BOARD_STATUS = {
  in_queue: { key: 'queue_lk_in_queue', color: '#2563EB' },
  called:   { key: 'queue_lk_called',   color: '#FF8400' },
  crossed:  { key: 'queue_lk_crossed',  color: '#22C55E' },
  revoked:  { key: 'queue_lk_revoked',  color: '#EF4444' },
};

export default function QueueScreen({ navigation }) {
  const v1 = useV1Colors();
  const { theme } = useTheme();
  const { t } = useI18n();
  const [borders, setBorders] = useState([]);
  const [loading, setLoading] = useState(true);
  // Хаб-навигация: 'hub' (страны) → 'country' (переходы выбранной страны).
  const [selectedCountry, setSelectedCountry] = useState(null);

  // Личный поиск по госномеру (Поток А): водитель вводит ГРНЗ → видит свой
  // реальный статус в очереди CGR (без авторизации, публичные данные).
  const [plate, setPlate] = useState('');
  const [lookup, setLookup] = useState(null);     // null | {found,...}
  const [lookupLoading, setLookupLoading] = useState(false);

  // Трек 1: полное табло пункта (номера + статус). Раскрывается по кнопке.
  const [boardFor, setBoardFor] = useState(null);      // имя пункта или null
  const [boardRows, setBoardRows] = useState([]);
  const [boardLoading, setBoardLoading] = useState(false);

  const openBoard = async (name) => {
    if (boardFor === name) { setBoardFor(null); setBoardRows([]); return; }
    setBoardFor(name); setBoardRows([]); setBoardLoading(true);
    try {
      const r = await fetch(`${BASE}/board?checkpoint=${encodeURIComponent(name)}`);
      const d = await r.json();
      setBoardRows(Array.isArray(d.rows) ? d.rows : []);
    } catch { setBoardRows([]); }
    finally { setBoardLoading(false); }
  };

  const [tracking, setTracking] = useState(false);  // сохранён ли номер для слежения

  const doLookup = async (plateArg, { silent = false } = {}) => {
    const p = (plateArg != null ? plateArg : plate).trim();
    if (p.length < 3 || lookupLoading) return;
    if (!silent) setLookupLoading(true);
    if (!silent) setLookup(null);
    try {
      const r = await fetch(`${BASE}/lookup?plate=${encodeURIComponent(p)}`);
      setLookup(await r.json());
      // Живое слежение: сохраняем номер — переживает перезапуск, при
      // следующем открытии/фокусе статус подтягивается автоматически.
      storage.set(PLATE_KEY, p).catch(() => {});
      setTracking(true);
      // Пуш-алерт: если водитель авторизован — регистрируем watch на сервере,
      // чтобы прилетел пуш «очередь подошла» при смене статуса (даже когда
      // приложение закрыто).
      storage.get('ur_reg_token').then((tok) => {
        if (!tok) return;
        fetch(`${BASE}/watch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tok}` },
          body: JSON.stringify({ plate: p }),
        }).catch(() => {});
      }).catch(() => {});
    } catch (e) {
      if (!silent) setLookup({ error: true });
    } finally {
      if (!silent) setLookupLoading(false);
    }
  };

  const stopTracking = () => {
    const p = plate.trim();
    storage.remove(PLATE_KEY).catch(() => {});
    // Снимаем серверный watch — пуши перестают приходить.
    if (p) {
      storage.get('ur_reg_token').then((tok) => {
        if (!tok) return;
        fetch(`${BASE}/watch?plate=${encodeURIComponent(p)}`, {
          method: 'DELETE', headers: { 'Authorization': `Bearer ${tok}` },
        }).catch(() => {});
      }).catch(() => {});
    }
    setTracking(false);
    setLookup(null);
    setPlate('');
  };

  // Загрузка сохранённого номера при первом входе + автоподтягивание статуса.
  useEffect(() => {
    (async () => {
      const saved = await storage.get(PLATE_KEY).catch(() => null);
      if (saved) { setPlate(saved); setTracking(true); doLookup(saved); }
    })();
  }, []);

  // Живое обновление: при возврате на экран перечитываем статус сохранённого
  // номера (тихо, без спиннера) — водитель видит актуальную очередь.
  useFocusEffect(
    useCallback(() => {
      (async () => {
        const saved = await storage.get(PLATE_KEY).catch(() => null);
        if (saved) doLookup(saved, { silent: true });
      })();
    }, [])
  );

  // Текст статуса для результата личного поиска.
  const LOOKUP_STATUS_KEY = {
    in_queue: 'queue_lk_in_queue', crossed: 'queue_lk_crossed',
    revoked: 'queue_lk_revoked', called: 'queue_lk_called',
  };

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
      const r = await fetch(`${BASE}?country=`);  // все переходы разом, группируем клиентом
      const data = await r.json();
      setBorders(data.borders || []);
    } catch (e) {
      console.warn('Borders fetch failed:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBorders(); }, []);

  // Метаданные стран для хаба (порядок: ядро Китай → СНГ).
  const COUNTRIES = [
    { k: 'CN', flag: '🇨🇳', l: t('queue_country_cn') },
    { k: 'RU', flag: '🇷🇺', l: t('queue_country_ru') },
    { k: 'UZ', flag: '🇺🇿', l: t('queue_country_uz') },
    { k: 'KG', flag: '🇰🇬', l: t('queue_country_kg') },
    { k: 'TM', flag: '🇹🇲', l: t('queue_country_tm') },
  ];
  const byCountry = (cc) => borders.filter(b => b.country === cc);
  // Свободнее всего в Китай (ядро бизнеса): переход с минимальной очередью.
  const cnList = byCountry('CN').filter(b => b.trucks_in_queue != null);
  const freest = cnList.length ? cnList.reduce((a, b) => (b.trucks_in_queue < a.trucks_in_queue ? b : a)) : null;


  // Просмотр очередей на границе — ПУБЛИЧНЫЙ (данные CGR отдаются без
  // авторизации). Раньше весь экран прятался за approved-гейтом — это
  // отсекало главную ценность (посмотреть очередь, найти свою машину) от
  // незарегистрированных водителей. Теперь смотрят ВСЕ; регистрация нужна
  // только для брони места — на это ниже мягкий (не блокирующий) баннер.
  if (verState === 'loading') {
    return (
      <SafeAreaView style={[{ flex: 1, backgroundColor: v1.bg }]} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
            <Text style={[s.backText, { color: theme.text }]}>‹</Text>
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: theme.text }]} testID="queue-title">{t('border_queues_title')}</Text>
          <View style={{ width: 44 }} />
        </View>
        <ActivityIndicator color="#1A5C3C" style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  const openCgrPortal = () => Linking.openURL(
    'https://cgr.qoldau.kz/ru/start?utm_source=urtruck&utm_medium=app&utm_campaign=booking_redirect'
  ).catch(() => {});

  // Детальная карточка перехода (видна в списке выбранной страны).
  const renderCheckpoint = (b) => {
    const col = STATUS_COLORS[b.status] || '#78716C';
    return (
      <View key={b.id} style={[s.card, { backgroundColor: theme.card, borderColor: theme.border, borderLeftColor: col, borderLeftWidth: 4 }]} testID="queue-checkpoint-card">
        <View style={s.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={[s.name, { color: theme.text }]}>{b.name}</Text>
            {b.name_en ? <Text style={[s.countries, { color: theme.textMuted }]}>{b.name_en}</Text> : null}
          </View>
          <View style={[s.statusBadge, { backgroundColor: col + '20' }]}>
            <View style={[s.statusDot, { backgroundColor: col }]} />
            <Text style={[s.statusText, { color: col }]}>{t(STATUS_KEY[b.status] || 'queue_status_nodata')}</Text>
          </View>
        </View>
        <View style={s.detailRow}>
          <Text style={[s.detailNum, { color: col }]}>{b.trucks_in_queue ?? '—'}</Text>
          <Text style={[s.detailLabel, { color: theme.textMuted }]}>{t('vehicles_label')}</Text>
          {b.estimated_wait_hours != null ? (
            <Text style={[s.detailWait, { color: theme.textMuted }]}>· {b.estimated_wait_hours}{t('cargoruqsat_live_hours_short')} {t('waiting_label').toLowerCase()}</Text>
          ) : null}
        </View>
        {b.updated_at ? (
          <Text style={[s.updated, { color: theme.textDim }]}>{t('queue_updated')}: {String(b.updated_at).slice(11, 16)} UTC</Text>
        ) : null}

        {/* Трек 1: раскрыть полное табло пункта (номера + статус). */}
        <TouchableOpacity style={s.boardToggle} onPress={() => openBoard(b.name)} testID="queue-board-toggle">
          <Text style={[s.boardToggleText, { color: v1.driver || '#00E676' }]}>
            {boardFor === b.name ? `▲ ${t('queue_board_hide')}` : `▼ ${t('queue_board_show')}`}
          </Text>
        </TouchableOpacity>
        {boardFor === b.name ? (
          <View style={s.boardWrap}>
            {boardLoading ? (
              <ActivityIndicator color={col} style={{ marginVertical: 10 }} />
            ) : boardRows.length === 0 ? (
              <Text style={[s.boardEmpty, { color: theme.textMuted }]}>{t('no_data')}</Text>
            ) : (
              boardRows.slice(0, 50).map((row, i) => {
                const st = BOARD_STATUS[row.status] || BOARD_STATUS.in_queue;
                return (
                  <View key={`${row.plate}-${i}`} style={[s.boardRow, { borderBottomColor: theme.border }]}>
                    <Text style={[s.boardPlate, { color: theme.text }]} numberOfLines={1}>{row.plate}</Text>
                    <Text style={[s.boardTime, { color: theme.textMuted }]} numberOfLines={1}>{row.queue_datetime || ''}</Text>
                    <View style={[s.boardStatus, { backgroundColor: st.color + '20' }]}>
                      <Text style={[s.boardStatusText, { color: st.color }]}>{t(st.key)}{row.is_late ? ' ⏱' : ''}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        ) : null}

        <TouchableOpacity style={s.bookBtn} onPress={openCgrPortal} testID="queue-book-cgr">
          <Text style={s.bookBtnText}>{t('queue_book_cgr')} ↗</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const selMeta = COUNTRIES.find(c => c.k === selectedCountry);

  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: v1.bg }]} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => (selectedCountry ? setSelectedCountry(null) : navigation.goBack())}
          style={s.back}
          testID="queue-back"
        >
          <Text style={[s.backText, { color: theme.text }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: theme.text }]} testID="queue-title">
          {selMeta ? `${selMeta.flag} ${selMeta.l}` : t('border_queues_title')}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      {/* ─────── Уровень 2: переходы выбранной страны ─────── */}
      {selectedCountry ? (
        <ScrollView
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchBorders} />}
        >
          {byCountry(selectedCountry)
            .slice()
            .sort((a, b) => (b.trucks_in_queue || 0) - (a.trucks_in_queue || 0))
            .map(renderCheckpoint)}
          {byCountry(selectedCountry).length === 0 && (
            <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: 40 }}>{t('no_data')}</Text>
          )}
        </ScrollView>
      ) : (
        /* ─────── Уровень 1: хаб ─────── */
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingTop: 4 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchBorders} />}
        >
          {/* Моя машина в очереди */}
          <View style={[s.lookupBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Feather name="truck" size={15} color={theme.text} />
              <Text style={[s.lookupLabel, { color: theme.text, marginBottom: 0 }]}>{t('queue_my_plate_label')}</Text>
            </View>
            <View style={s.lookupRow}>
              <TextInput
                style={[s.lookupInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bg }]}
                value={plate}
                onChangeText={setPlate}
                placeholder={t('queue_my_plate_placeholder')}
                placeholderTextColor={theme.textDim}
                autoCapitalize="characters"
                autoCorrect={false}
                onSubmitEditing={doLookup}
                returnKeyType="search"
                testID="queue-plate-input"
              />
              <TouchableOpacity style={s.lookupBtn} onPress={doLookup} disabled={lookupLoading} testID="queue-plate-search">
                {lookupLoading ? <ActivityIndicator color="#FFF" /> : <Text style={s.lookupBtnText}>{t('queue_lookup_btn')}</Text>}
              </TouchableOpacity>
            </View>
            {lookup && (
              lookup.error ? (
                <Text style={[s.lookupResult, { color: '#EF4444' }]}>{t('cgr_unavailable')}</Text>
              ) : lookup.found ? (
                <View style={s.lookupFound}>
                  <Text style={[s.lookupResult, { color: theme.text }]}>
                    {t(LOOKUP_STATUS_KEY[lookup.status] || 'queue_lk_unknown')}
                    {lookup.is_late ? ` · ${t('queue_lk_late')}` : ''}
                  </Text>
                  <Text style={[s.lookupSub, { color: theme.textMuted }]}>
                    {lookup.checkpoint}{lookup.queue_datetime ? ` · ${lookup.queue_datetime}` : ''}
                  </Text>
                </View>
              ) : (
                <Text style={[s.lookupResult, { color: theme.textMuted }]}>{t('queue_lookup_not_found')}</Text>
              )
            )}
            {tracking ? (
              <View style={s.trackRow}>
                <Text style={[s.trackHint, { color: theme.textDim }]}>🟢 {t('queue_tracking_on')}</Text>
                <TouchableOpacity onPress={stopTracking} testID="queue-stop-tracking">
                  <Text style={[s.trackStop, { color: theme.textMuted }]}>{t('queue_stop_tracking')}</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>

          {/* Вход на экран «Мои номера в очереди» — список всех отслеживаемых
              ГРНЗ с живым статусом и пуш-алертом. */}
          <TouchableOpacity
            style={[s.trackedLink, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => navigation.navigate('TrackedPlates')}
            testID="queue-open-tracked"
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
              <Feather name="truck" size={15} color={theme.text} />
              <Text style={[s.trackedLinkText, { color: theme.text }]}>{t('tracked_open')}</Text>
            </View>
            <Text style={[s.cgrLinkChevron, { color: theme.textMuted }]}>›</Text>
          </TouchableOpacity>

          {/* Незарегистрированным — мягкий баннер: смотреть можно всем,
              бронь места нужна регистрация (крючок привлечения). */}
          {verState !== 'approved' ? (
            <TouchableOpacity
              style={[s.regBanner, { borderColor: v1.driver || '#00E676', backgroundColor: (v1.driver || '#00E676') + '14' }]}
              onPress={() => navigation.navigate('Citizenship')}
              testID="queue-reg-banner"
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                <Feather name="unlock" size={15} color={v1.driver || '#00E676'} />
                <Text style={[s.regBannerText, { color: theme.text }]}>{t('queue_register_to_book')}</Text>
              </View>
              <Text style={[s.cgrLinkChevron, { color: theme.textMuted }]}>›</Text>
            </TouchableOpacity>
          ) : null}

          {/* Свободнее всего в Китай (ядро бизнеса) */}
          {freest ? (
            <TouchableOpacity
              style={[s.freestCard, { borderColor: '#22C55E' }]}
              onPress={() => setSelectedCountry('CN')}
              testID="queue-freest"
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Feather name="star" size={14} color="#22C55E" />
                <Text style={[s.freestLabel, { marginBottom: 0 }]}>{t('queue_hub_freest')} 🇨🇳</Text>
              </View>
              <Text style={[s.freestName, { color: theme.text }]}>
                {freest.name} — {freest.trucks_in_queue} {t('vehicles_label').toLowerCase()} 🟢
              </Text>
            </TouchableOpacity>
          ) : null}

          {/* Выбор страны */}
          <Text style={[s.sectionTitle, { color: theme.textMuted }]}>{t('queue_select_country')}</Text>
          {loading && borders.length === 0 && <ActivityIndicator color="#1A5C3C" style={{ marginTop: 20 }} />}
          {COUNTRIES.map(c => {
            const list = byCountry(c.k);
            if (list.length === 0) return null;
            return (
              <TouchableOpacity
                key={c.k}
                style={[s.countryCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                onPress={() => setSelectedCountry(c.k)}
                testID={`queue-country-${c.k}`}
              >
                <Text style={s.countryFlag}>{c.flag}</Text>
                <Text style={[s.countryName, { color: theme.text }]}>{c.l}</Text>
                <Text style={[s.countryCount, { color: theme.textMuted }]}>
                  {list.length} {t('queue_crossings_n')}
                </Text>
                <Text style={[s.cgrLinkChevron, { color: theme.textMuted }]}>›</Text>
              </TouchableOpacity>
            );
          })}

          {/* CarGoRuqsat портал */}
          <TouchableOpacity style={[s.cgrLink, { marginTop: 16, marginHorizontal: 0 }]} onPress={() => navigation.navigate('CargoRuqsatInfo')} testID="queue-cgr-link-approved">
            <Text style={s.cgrLinkText}>🅿️ {t('queue_cgr_cta')}</Text>
            <Text style={[s.cgrLinkChevron, { color: theme.textMuted }]}>›</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
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
  statLabel: { fontSize: 11, marginTop: 2 },
  updated: { fontSize: 11, marginTop: 8, textAlign: 'right' },
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
  lookupBox: { marginHorizontal: 16, marginBottom: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
  trackRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  trackHint: { fontSize: 12, fontWeight: '700' },
  trackStop: { fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' },
  regBanner: { marginHorizontal: 16, marginBottom: 12, padding: 14, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
  trackedLink: { marginHorizontal: 16, marginBottom: 12, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
  trackedLinkText: { fontSize: 14, fontWeight: '800', flex: 1 },
  regBannerText: { fontSize: 14, fontWeight: '800', flex: 1 },
  lookupLabel: { fontSize: 12, fontWeight: '600', marginBottom: 8 },
  lookupRow: { flexDirection: 'row', gap: 8 },
  lookupInput: { flex: 1, height: 44, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, fontSize: 15, fontWeight: '700' },
  lookupBtn: { height: 44, paddingHorizontal: 18, borderRadius: 10, backgroundColor: '#1A5C3C', alignItems: 'center', justifyContent: 'center' },
  lookupBtnText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  lookupFound: { marginTop: 10 },
  lookupResult: { fontSize: 14, fontWeight: '700', marginTop: 10 },
  lookupSub: { fontSize: 12, marginTop: 3 },
  freestCard: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 16, backgroundColor: 'rgba(34,197,94,0.08)' },
  freestLabel: { fontSize: 12, fontWeight: '800', color: '#22C55E', marginBottom: 4 },
  freestName: { fontSize: 16, fontWeight: '800' },
  sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginBottom: 10, textTransform: 'uppercase' },
  countryCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 16, marginBottom: 10 },
  countryFlag: { fontSize: 26, marginRight: 14 },
  countryName: { flex: 1, fontSize: 17, fontWeight: '800' },
  countryCount: { fontSize: 13, marginRight: 8 },
  detailRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 4 },
  detailNum: { fontSize: 28, fontWeight: '900' },
  detailLabel: { fontSize: 13 },
  detailWait: { fontSize: 12 },
  bookBtn: { marginTop: 12, height: 44, borderRadius: 10, backgroundColor: '#1A5C3C', alignItems: 'center', justifyContent: 'center' },
  bookBtnText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  boardToggle: { marginTop: 10, paddingVertical: 8, minHeight: 40, justifyContent: 'center' },
  boardToggleText: { fontSize: 13, fontWeight: '800' },
  boardWrap: { marginTop: 4, marginBottom: 4 },
  boardEmpty: { fontSize: 12, textAlign: 'center', paddingVertical: 10 },
  boardRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1 },
  boardPlate: { flex: 1, fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  boardTime: { fontSize: 11, minWidth: 70, textAlign: 'right' },
  boardStatus: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  boardStatusText: { fontSize: 11, fontWeight: '700' },
});
