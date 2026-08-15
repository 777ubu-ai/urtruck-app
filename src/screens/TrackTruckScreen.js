// TrackTruckScreen — грузоотправитель видит, где сейчас машина (задача B).
// Карта вынесена в TruckMap (native = react-native-maps/Apple Maps без
// ключа; web = фолбэк). Позиция тянется поллингом GET
// /market/deals/{id}/location раз в 10с и остаётся внутри UrTruck.
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import { marketAPI } from '../utils/marketAPI';
import TruckMap from '../components/TruckMap';
import { parseCity, distance as geoDistance, isNearBorder } from '../utils/geo';
import { localizePlace } from '../utils/places';
import { getLanguage } from '../utils/i18n';
import { classifyDealLocation } from '../utils/gpsQuality';

export default function TrackTruckScreen({ navigation, route }) {
  const { dealId, from, to, driverName, driverOnline = false } = route.params || {};
  const { t } = useI18n();
  const { theme } = useTheme();
  const [loc, setLoc] = useState(null);
  const [quality, setQuality] = useState({ hasPoint: false, isLive: false, isStale: false, ageSeconds: null, freshness: 'missing' });
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    if (!dealId) { setLoading(false); return; }
    const r = await marketAPI.getDealLocation(dealId);
    if (!mounted.current) return;
    setLoading(false);
    if (!r?.ok) {
      setOffline(!!r?.offline);
      return;
    }
    setOffline(false);
    const nextQuality = classifyDealLocation(r);
    setQuality(nextQuality);
    setLoc(nextQuality.hasPoint ? r.location : null);
  }, [dealId]);

  useEffect(() => {
    mounted.current = true;
    load();
    const iv = setInterval(load, 10000);   // 10с — живее «движение машины»
    return () => { mounted.current = false; clearInterval(iv); };
  }, [load]);

  const lat = loc ? Number(loc.lat) : null;
  const lng = loc ? Number(loc.lng) : null;

  // Живая «расшифровка» как в Яндекс.Такси: осталось км до пункта, скорость,
  // ETA, когда обновлялось, отметка «на границе».
  const destCoord = parseCity(to);
  const driverCoord = (lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng)) ? [lat, lng] : null;
  const kmLeftRaw = (destCoord && driverCoord) ? geoDistance(driverCoord, destCoord) : null;
  const kmLeft = (kmLeftRaw != null && !Number.isNaN(kmLeftRaw)) ? Math.round(kmLeftRaw) : null;
  const speedKmh = (loc && loc.speed != null && loc.speed >= 0) ? Math.round(loc.speed * 3.6) : null;
  const agoMin = quality.ageSeconds == null ? null : Math.max(0, Math.round(quality.ageSeconds / 60));
  // Точка «свежая» только если обновлялась недавно (≤ 30 мин). Иначе это старая
  // отметка (водитель ещё не выехал / давно не выходил на связь) — НЕ показываем
  // её как живое движение и не выдумываем скорость/ETA из протухших данных.
  const isStale = !quality.isLive;
  const moving = speedKmh != null && speedKmh >= 5 && !isStale;
  const etaMin = (kmLeft != null && moving) ? Math.round((kmLeft / speedKmh) * 60) : null;
  const nearBorder = driverCoord ? isNearBorder(lat, lng) : false;
  const fmtEta = (m) => (m == null ? '—' : m < 60 ? `${m} ${t('track_min')}` : `${Math.floor(m / 60)} ${t('track_hour')} ${m % 60} ${t('track_min')}`);
  // «Обновлено N назад» человеческим языком: мин → часы → дни (а не «2131 мин»).
  const fmtAgo = (m) => {
    if (m == null) return '';
    if (m === 0) return t('track_updated_now');
    const unit = m < 60 ? `${m} ${t('track_min')}`
      : m < 1440 ? `${Math.floor(m / 60)} ${t('track_hour')}`
      : `${Math.floor(m / 1440)} ${t('track_day')}`;
    return `${t('track_updated')} ${unit} ${t('track_ago')}`;
  };
  const openDriverChat = () => navigation.goBack();

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[s.back, { color: theme.text }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[s.title, { color: theme.text }]} numberOfLines={1}>{t('track_truck_title')}</Text>
        <View style={{ width: 24 }} />
      </View>
      <Text style={[s.route, { color: theme.textMuted }]} numberOfLines={1}>{localizePlace(from || '—', getLanguage())} → {localizePlace(to || '—', getLanguage())}</Text>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 48 }} color={theme.text} />
      ) : !loc ? (
        <View style={s.empty}>
          <Feather name={offline ? 'wifi-off' : 'navigation'} size={44} color={offline ? '#D64545' : theme.textMuted} />
          <Text style={[s.emptyTitle, { color: theme.text }]}>{offline ? t('track_offline_title') : t('track_truck_waiting')}</Text>
          <Text style={[s.emptyDesc, { color: theme.textMuted }]}>{offline ? t('track_offline') : t('track_truck_waiting_desc')}</Text>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {/* Живая расшифровка: осталось · скорость · ETA · обновлено */}
          <View style={[s.stats, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={s.stat}>
              <Text style={[s.statNum, { color: theme.text }]}>{kmLeft != null ? kmLeft : '—'}</Text>
              <Text style={[s.statLbl, { color: theme.textMuted }]}>{t('track_left')} · {t('km_short')}</Text>
            </View>
            <View style={[s.statDiv, { backgroundColor: theme.border }]} />
            <View style={s.stat}>
              <Text style={[s.statNum, { color: moving ? '#168759' : theme.textMuted }]}>{(!isStale && speedKmh != null) ? speedKmh : '—'}</Text>
              <Text style={[s.statLbl, { color: theme.textMuted }]}>{t('track_speed_label')} · {t('kmh_short')}</Text>
            </View>
            <View style={[s.statDiv, { backgroundColor: theme.border }]} />
            <View style={s.stat}>
              <Text style={[s.statNum, { color: theme.text, fontSize: 15 }]}>{moving ? fmtEta(etaMin) : t('track_stopped')}</Text>
              <Text style={[s.statLbl, { color: theme.textMuted }]}>{t('track_eta_label')}</Text>
            </View>
          </View>
          {/* Данные устарели → честно предупреждаем, а не выдаём старую точку за
              живое движение (водитель ещё не выехал / давно не выходил на связь). */}
          {isStale ? (
            <View style={[s.staleBanner, { backgroundColor: 'rgba(245,158,11,0.12)', borderColor: '#F59E0B' }]}>
              <Feather name="clock" size={13} color="#F59E0B" />
              <Text style={s.staleText} numberOfLines={2}>
                {quality.terminal || quality.freshness === 'stopped' ? t('track_last_known') : t('track_stale')}
              </Text>
            </View>
          ) : null}
          {offline ? (
            <View style={[s.staleBanner, { backgroundColor: 'rgba(214,69,69,0.10)', borderColor: '#D64545' }]}>
              <Feather name="wifi-off" size={13} color="#D64545" />
              <Text style={[s.staleText, { color: '#D64545' }]}>{t('track_offline')}</Text>
            </View>
          ) : null}
          <View style={s.subRow}>
            {nearBorder && !isStale ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Feather name="flag" size={12} color="#168759" />
                <Text style={[s.badgeBorder]}>{t('track_near_border')}</Text>
              </View>
            ) : <View />}
            <Text style={[s.updated, { color: theme.textDim }]}>{fmtAgo(agoMin)}</Text>
          </View>
          <TruckMap lat={lat} lng={lng} title={driverName || t('track_truck_marker')} stale={isStale} />
        </View>
      )}

      <View style={[s.driverCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={s.driverIdentity}>
          <View style={s.driverAvatar}>
            <Feather name="user" size={20} color="#0F6B47" />
          </View>
          <View style={s.driverText}>
            <Text style={[s.driverName, { color: theme.text }]} numberOfLines={1}>
              {driverName || t('role_driver')}
            </Text>
            <View style={s.presenceRow}>
              {driverOnline ? <View style={s.onlineDot} /> : null}
              <Text style={[s.driverStatus, { color: driverOnline ? '#168759' : theme.textMuted }]}>
                {driverOnline ? t('chat_online') : t('role_driver')}
              </Text>
            </View>
          </View>
        </View>
        <View style={s.contactRow}>
          <TouchableOpacity
            style={s.messageBtn}
            onPress={openDriverChat}
            testID="track-message-driver"
            accessibilityLabel={t('write_driver')}
          >
            <Feather name="message-circle" size={18} color="#FFFFFF" />
            <Text style={s.messageBtnText}>{t('write_driver')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  back: { fontSize: 30, fontWeight: '300', width: 24 },
  title: { fontSize: 18, fontWeight: '800', flex: 1, textAlign: 'center' },
  route: { fontSize: 13, textAlign: 'center', marginBottom: 8 },
  stats: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 6, borderWidth: 1, borderRadius: 14, paddingVertical: 12 },
  stat: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 22, fontWeight: '900' },
  statLbl: { fontSize: 10.5, fontWeight: '700', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.3, textAlign: 'center' },
  statDiv: { width: 1, height: 34 },
  subRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, marginBottom: 8, minHeight: 18 },
  badgeBorder: { color: '#168759', fontSize: 12, fontWeight: '800' },
  updated: { fontSize: 11, textAlign: 'right', flex: 1 },
  staleBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 8, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderRadius: 12 },
  staleText: { flex: 1, fontSize: 12, color: '#F59E0B', fontWeight: '600', lineHeight: 16 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center', marginTop: 8 },
  emptyDesc: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  driverCard: { marginHorizontal: 12, marginTop: 8, marginBottom: 10, padding: 12, borderWidth: 1, borderRadius: 16, gap: 10 },
  driverIdentity: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  driverAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8F6EF' },
  driverText: { flex: 1, minWidth: 0 },
  driverName: { fontSize: 15, fontWeight: '800' },
  presenceRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#168759' },
  driverStatus: { fontSize: 11, fontWeight: '700' },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  messageBtn: { flex: 1, height: 48, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#0F6B47' },
  messageBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
