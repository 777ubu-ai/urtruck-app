import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator, TextInput, Linking, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../utils/ThemeContext';
import { useI18n } from '../utils/useI18n';
import {v1Colors, useV1Colors} from '../theme/designV1';
import HeaderMenuButton from '../components/ui/v1/HeaderMenuButton';
import { API_BASE } from '../config/env';
import { regAPI } from '../utils/registration';
import { storage } from '../utils/storage';

const PLATE_KEY = 'ur_queue_plate';

const BASE = `${API_BASE}/borders`;

const STATUS_COLORS = { green: '#168A5B', yellow: '#FF8400', red: '#EF4444' };
// Метки статуса локализованы через t() в рендере (statusLabel) — раньше были
// хардкод-RU и протекали в ZH/EN/KZ.
const STATUS_KEY = { green: 'queue_status_free', yellow: 'queue_status_moderate', red: 'queue_status_busy' };
// Статусы строк табло (номер в очереди): цвет + i18n-ключ.
const BOARD_STATUS = {
  in_queue: { key: 'queue_lk_in_queue', color: '#168A5B' },
  called:   { key: 'queue_lk_called',   color: '#E06D00' },
  crossed:  { key: 'queue_lk_crossed',  color: '#168A5B' },
  revoked:  { key: 'queue_lk_revoked',  color: '#EF4444' },
};

export default function QueueScreen({ navigation, route }) {
  const v1 = useV1Colors();
  const { theme } = useTheme();
  const { t } = useI18n();
  const role = route?.params?.role || 'client';
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
  const [bookingModal, setBookingModal] = useState(false);
  const [bookingNumber, setBookingNumber] = useState('');
  const [bookingCheckpoint, setBookingCheckpoint] = useState('');
  const [myBookings, setMyBookings] = useState([]);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState('');

  const loadMyBookings = useCallback(async () => {
    try {
      const tok = await storage.get('ur_reg_token');
      if (!tok) { setMyBookings([]); return; }
      const r = await fetch(`${BASE}/bookings/active`, { headers: { Authorization: `Bearer ${tok}` } });
      const d = await r.json();
      setMyBookings(Array.isArray(d.bookings) ? d.bookings : []);
    } catch { setMyBookings([]); }
  }, []);

  const attachBooking = async () => {
    const number = bookingNumber.trim();
    if (number.length < 3 || bookingLoading) return;
    setBookingLoading(true); setBookingError('');
    try {
      const tok = await storage.get('ur_reg_token');
      if (!tok) { setBookingModal(false); navigation.navigate('Citizenship'); return; }
      const r = await fetch(`${BASE}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ booking_number: number, checkpoint_code: bookingCheckpoint.trim() || null }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || 'Не удалось привязать бронь');
      setBookingNumber(''); setBookingCheckpoint(''); setBookingModal(false);
      await loadMyBookings();
    } catch (e) { setBookingError(e.message || 'Ошибка'); }
    finally { setBookingLoading(false); }
  };

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
  useFocusEffect(useCallback(() => { loadMyBookings(); }, [loadMyBookings]));

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
        <ActivityIndicator color="#168A5B" style={{ marginTop: 60 }} />
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
          <Text style={[s.boardToggleText, { color: v1.driver || '#168A5B' }]}>
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
        <HeaderMenuButton navigation={navigation} role={role} testID="queue-menu-btn" />
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

          <View style={[s.bookingsBox, { backgroundColor: theme.card, borderColor: theme.border }]} testID="queue-my-bookings">
            <View style={s.bookingsHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[s.bookingsTitle, { color: theme.text }]}>Мои брони очереди</Text>
                <Text style={[s.bookingsHint, { color: theme.textMuted }]}>Статус машины и уведомления в UrTruck</Text>
              </View>
              <TouchableOpacity style={s.addBookingBtn} onPress={() => { setBookingError(''); setBookingModal(true); }} testID="queue-add-booking">
                <Text style={s.addBookingBtnText}>+ Добавить</Text>
              </TouchableOpacity>
            </View>
            {myBookings.length === 0 ? (
              <Text style={[s.emptyBooking, { color: theme.textMuted }]}>Привяжите номер брони, оформленной в CarGoRuqsat</Text>
            ) : myBookings.map((b) => (
              <View key={String(b.id)} style={[s.bookingRow, { borderTopColor: theme.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.bookingNumber, { color: theme.text }]}>{b.cgr_booking_number}</Text>
                  <Text style={[s.bookingMeta, { color: theme.textMuted }]}>{b.checkpoint_code || 'Пункт не указан'} · {b.queue_position ? `позиция ${b.queue_position}` : 'статус обновляется'}</Text>
                </View>
                <Text style={[s.bookingStatus, { color: b.status === 'active' ? '#16A34A' : '#64748B' }]}>{b.status}</Text>
              </View>
            ))}
          </View>

          {/* Незарегистрированным — мягкий баннер: смотреть можно всем,
              бронь места нужна регистрация (крючок привлечения). */}
          {verState !== 'approved' ? (
            <TouchableOpacity
              style={[s.regBanner, { borderColor: v1.driver || '#168A5B', backgroundColor: (v1.driver || '#168A5B') + '14' }]}
              onPress={() => navigation.navigate('Citizenship')}
              testID="queue-reg-banner"
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                <Feather name="unlock" size={15} color={v1.driver || '#168A5B'} />
                <Text style={[s.regBannerText, { color: theme.text }]}>{t('queue_register_to_book')}</Text>
              </View>
              <Text style={[s.cgrLinkChevron, { color: theme.textMuted }]}>›</Text>
            </TouchableOpacity>
          ) : null}

          {/* Свободнее всего в Китай (ядро бизнеса) */}
          {freest ? (
            <TouchableOpacity
              style={[s.freestCard, { borderColor: '#168A5B' }]}
              onPress={() => setSelectedCountry('CN')}
              testID="queue-freest"
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Feather name="star" size={14} color="#168A5B" />
                <Text style={[s.freestLabel, { marginBottom: 0 }]}>{t('queue_hub_freest')} 🇨🇳</Text>
              </View>
              <Text style={[s.freestName, { color: theme.text }]}>
                {freest.name} — {freest.trucks_in_queue} {t('vehicles_label').toLowerCase()} 🟢
              </Text>
            </TouchableOpacity>
          ) : null}

          {/* Выбор страны */}
          <Text style={[s.sectionTitle, { color: theme.textMuted }]}>{t('queue_select_country')}</Text>
          {loading && borders.length === 0 && <ActivityIndicator color="#168A5B" style={{ marginTop: 20 }} />}
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

          {/* Оформление новой брони остаётся в официальной системе до подключения Smart Bridge. */}
          <TouchableOpacity style={[s.cgrLink, { marginTop: 16, marginHorizontal: 0 }]} onPress={() => navigation.navigate('CargoRuqsatInfo')} testID="queue-cgr-link-approved">
            <Text style={s.cgrLinkText}>Оформить новую бронь в CarGoRuqsat ↗</Text>
            <Text style={[s.cgrLinkChevron, { color: theme.textMuted }]}>›</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
      <Modal visible={bookingModal} transparent animationType="fade" onRequestClose={() => setBookingModal(false)}>
        <View style={s.modalBackdrop}>
          <View style={[s.modalCard, { backgroundColor: theme.card }]}>
            <Text style={[s.modalTitle, { color: theme.text }]}>Добавить бронь</Text>
            <Text style={[s.modalHint, { color: theme.textMuted }]}>Введите номер брони из официальной системы CarGoRuqsat. UrTruck будет показывать статус и отправлять уведомления.</Text>
            <TextInput value={bookingNumber} onChangeText={setBookingNumber} placeholder="Номер брони" placeholderTextColor={theme.textDim} style={[s.modalInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bg }]} autoCapitalize="characters" />
            <TextInput value={bookingCheckpoint} onChangeText={setBookingCheckpoint} placeholder="Пункт пропуска (необязательно)" placeholderTextColor={theme.textDim} style={[s.modalInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bg }]} />
            {bookingError ? <Text style={s.bookingError}>{bookingError}</Text> : null}
            <TouchableOpacity style={s.modalPrimary} onPress={attachBooking} disabled={bookingLoading}><Text style={s.modalPrimaryText}>{bookingLoading ? 'Сохраняем…' : 'Привязать бронь'}</Text></TouchableOpacity>
            <TouchableOpacity style={s.modalSecondary} onPress={() => setBookingModal(false)}><Text style={[s.modalSecondaryText, { color: theme.textMuted }]}>Отмена</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  headerTitle: { fontSize: 19, fontWeight: '700', letterSpacing: -0.2 },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  chipText: { fontSize: 12, fontWeight: '700' },
  card: { borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  name: { fontSize: 14, fontWeight: '700' },
  countries: { fontSize: 12, marginTop: 2 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8 },
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
  gateBtn: { height: 52, borderRadius: 14, backgroundColor: '#168A5B', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, minWidth: 220 },
  gateBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  gateSecondary: { marginTop: 12, paddingVertical: 8 },
  gateSecondaryText: { fontSize: 13, fontWeight: '600' },
  cgrLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#168A5B', backgroundColor: 'rgba(26,92,60,0.08)' },
  cgrLinkText: { fontSize: 14, fontWeight: '700', color: '#168A5B' },
  cgrLinkChevron: { fontSize: 20, fontWeight: '300' },
  lookupBox: { marginHorizontal: 16, marginBottom: 8, padding: 12, borderRadius: 10, borderWidth: 1 },
  trackRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  trackHint: { fontSize: 12, fontWeight: '700' },
  trackStop: { fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' },
  bookingsBox: { marginHorizontal: 16, marginBottom: 8, padding: 14, borderRadius: 10, borderWidth: 1 },
  bookingsHeader: { flexDirection: 'row', alignItems: 'center' },
  bookingsTitle: { fontSize: 15, fontWeight: '800' },
  bookingsHint: { fontSize: 11, marginTop: 3 },
  addBookingBtn: { backgroundColor: '#168A5B', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 9 },
  addBookingBtnText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  emptyBooking: { fontSize: 12, lineHeight: 18, marginTop: 12 },
  bookingRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, paddingTop: 10, marginTop: 10 },
  bookingNumber: { fontSize: 13, fontWeight: '800' },
  bookingMeta: { fontSize: 11, marginTop: 3 },
  bookingStatus: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 420, borderRadius: 18, padding: 20 },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8 },
  modalHint: { fontSize: 13, lineHeight: 19, marginBottom: 14 },
  modalInput: { height: 48, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, marginBottom: 10 },
  bookingError: { color: '#DC2626', fontSize: 12, marginBottom: 8 },
  modalPrimary: { height: 48, borderRadius: 10, backgroundColor: '#168A5B', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  modalPrimaryText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  modalSecondary: { alignItems: 'center', paddingVertical: 12 },
  modalSecondaryText: { fontSize: 13, fontWeight: '700' },
  regBanner: { marginHorizontal: 16, marginBottom: 12, padding: 14, borderRadius: 10, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
  trackedLink: { marginHorizontal: 16, marginBottom: 12, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 10, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
  trackedLinkText: { fontSize: 14, fontWeight: '700', flex: 1 },
  regBannerText: { fontSize: 14, fontWeight: '700', flex: 1 },
  lookupLabel: { fontSize: 12, fontWeight: '600', marginBottom: 8 },
  lookupRow: { flexDirection: 'row', gap: 8 },
  lookupInput: { flex: 1, height: 44, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, fontSize: 15, fontWeight: '700' },
  lookupBtn: { height: 44, paddingHorizontal: 18, borderRadius: 10, backgroundColor: '#168A5B', alignItems: 'center', justifyContent: 'center' },
  lookupBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  lookupFound: { marginTop: 10 },
  lookupResult: { fontSize: 14, fontWeight: '700', marginTop: 10 },
  lookupSub: { fontSize: 12, marginTop: 3 },
  freestCard: { borderWidth: 1, borderRadius: 10, padding: 14, marginBottom: 16, backgroundColor: 'rgba(34,197,94,0.08)' },
  freestLabel: { fontSize: 12, fontWeight: '700', color: '#168A5B', marginBottom: 4 },
  freestName: { fontSize: 14, fontWeight: '700' },
  sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginBottom: 10, textTransform: 'uppercase' },
  countryCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 8 },
  countryFlag: { fontSize: 26, marginRight: 14 },
  countryName: { flex: 1, fontSize: 14, fontWeight: '700' },
  countryCount: { fontSize: 11, marginRight: 8 },
  detailRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 4 },
  detailNum: { fontSize: 20, fontWeight: '800', letterSpacing: -0.2 },
  detailLabel: { fontSize: 11 },
  detailWait: { fontSize: 12 },
  bookBtn: { marginTop: 12, height: 44, borderRadius: 10, backgroundColor: '#168A5B', alignItems: 'center', justifyContent: 'center' },
  bookBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  boardToggle: { marginTop: 10, paddingVertical: 8, minHeight: 40, justifyContent: 'center' },
  boardToggleText: { fontSize: 13, fontWeight: '700' },
  boardWrap: { marginTop: 4, marginBottom: 4 },
  boardEmpty: { fontSize: 12, textAlign: 'center', paddingVertical: 10 },
  boardRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1 },
  boardPlate: { flex: 1, fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  boardTime: { fontSize: 11, minWidth: 70, textAlign: 'right' },
  boardStatus: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  boardStatusText: { fontSize: 11, fontWeight: '700' },
});
