// Deal Room UI components (PR2) — презентационный слой поверх backend
// foundation (PR #60). Industrial Luxury, dark premium.
//
// Содержит:
//   - DealRoomCard   — карточка сделки сверху Deal Chat Screen
//   - SystemEventRow — рендер системного события из deal_events через i18n
//                      (event_type/i18n_key/payload — НЕ русский хардкод)
//   - DealQuickActions — нижняя панель быстрых действий (disabled/pending,
//                      пока backend-action не подключён — без фейков)
//   - DealDocumentsPlaceholder — секция «Документы» (PR3, заглушка)
//
// Акцент роли: driver #168759 / client #FF8400 (источник истины CLAUDE.md).

import React from 'react';
import { Platform, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useI18n } from '../../utils/useI18n';
import { useTheme } from '../../utils/ThemeContext';
import { userFacingDealStatus } from '../../utils/dealStatusOrder';
import { localizeCargoName, localizePlace } from '../../utils/places';
import { parseRouteCities } from '../../utils/geo';
import TruckMap from '../TruckMap';

export const DRIVER_ACCENT = '#168759';
export const CLIENT_ACCENT = '#FF8400';
export const accentFor = (role) => (role === 'driver' ? DRIVER_ACCENT : CLIENT_ACCENT);

// Статус сделки → цвет (нейтральный fallback — серый).
const DEAL_STATUS_COLOR = {
  active: '#168759', confirmed: '#168759', accepted: '#168759',
  in_progress: '#FF8400', at_border: '#168759',
  pending: '#FF8400', draft: '#FF8400',
  cancelled: '#7C8B82', rejected: '#EF4444', dispute: '#EF4444',
  completed: '#168759', delivered: '#168759',
};

const DRIVER_MAP_STATUSES = ['accepted', 'in_progress', 'at_border', 'delivered'];

// Перевод i18n_key из backend ("deal_event.bid_accepted") → плоский t()-ключ
// ("deal_event_bid_accepted"). Фронт переводит по ключу + payload, fallback —
// сам event_type, чтобы событие никогда не рендерилось пустым.
export function systemEventText(t, ev) {
  const raw = ev?.i18n_key || ev?.event_type || '';
  const flat = raw.replace(/[.\-]/g, '_');
  const p = ev?.payload || {};
  if (flat === 'deal_event_status_changed' && p.status) {
    const specific = t(`deal_event_status_${p.status}`);
    if (specific && specific !== `deal_event_status_${p.status}`) return specific;
  }
  const translated = t(flat);
  if (translated && translated !== flat) {
    return translated
      .replace('{amount}', p.amount != null ? String(p.amount) : '—')
      .replace('{currency}', p.currency || '')
      .replace('{status}', p.status || '—');
  }
  return raw || t('chat_system_event');
}

// The horizontal timeline remains removed; the compact current-status row
// and one next-action button now expose the required border step without
// bringing the crowded stepper back.

export function DealRoomCard({ deal, role }) {
  const { t, lang } = useI18n();
  const { theme } = useTheme();
  const accent = accentFor(role);
  if (!deal) return null;
  const status = deal.status || 'active';
  // Display status follows the backend FSM, including the required border
  // step for international routes.
  const displayStatus = userFacingDealStatus(status);
  const stColor = DEAL_STATUS_COLOR[displayStatus] || '#7C8B82';
  // H-1: статус сделки русским словом через i18n; фолбэк на сырой статус для
  // немаппленных значений (confirmed/draft/dispute — нет ключа status_*).
  const stKey = 'status_' + displayStatus;
  const stLabel = t(stKey) !== stKey ? t(stKey) : displayStatus;
  const rawRoute = [deal.from_city, deal.to_city].filter(Boolean).join(' → ');
  const routePoints = parseRouteCities(rawRoute);
  const route = [deal.from_city, deal.to_city]
    .filter(Boolean)
    .map((place) => localizePlace(place, lang))
    .join(' → ') || '—';

  // Product rule: once a deal exists, the route is visible without an extra
  // "Где машина" / "Открыть маршрут" action. On web/PWA the Yandex map is
  // embedded immediately in the deal. For the shipper the existing live-GPS
  // card takes over after the trip starts; for the driver the planned route
  // remains visible throughout the active trip.
  const showAutomaticRouteMap = false; // Full-screen map only: keep chat/deal card compact.

  const language = String(lang || 'ru').toLowerCase();
  const mapCopy = language.startsWith('zh')
    ? { title: '计划路线', hint: '行程开始后，车辆位置会自动显示', live: '车辆位置' }
    : language.startsWith('en')
      ? { title: 'Planned route', hint: 'Truck location will appear automatically after trip start', live: 'Truck location' }
      : language.startsWith('kk')
        ? { title: 'Жоспарланған бағыт', hint: 'Рейс басталғаннан кейін көліктің орны автоматты түрде көрінеді', live: 'Көлік бағыты' }
        : { title: 'Плановый маршрут', hint: 'После начала рейса машина появится автоматически', live: 'Машина на маршруте' };

  const Field = ({ icon, label, value }) => (
    <View style={s.field}>
      <Feather name={icon} size={13} color={theme.textMuted} />
      <Text style={[s.fieldLabel, { color: theme.textMuted }]}>{label}</Text>
      <Text style={[s.fieldValue, { color: theme.text }]} numberOfLines={1}>{value || '—'}</Text>
    </View>
  );

  return (
    <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border, borderLeftColor: accent }]} testID="deal-room-card">
      <View style={s.cardTop}>
        <Text style={[s.route, { color: theme.text }]} numberOfLines={1}>{route}</Text>
        <View style={[s.statusBadge, { backgroundColor: stColor + '22' }]}>
          <View style={[s.dot, { backgroundColor: stColor }]} />
          <Text style={[s.statusText, { color: stColor }]}>{t('chat_deal_card_status')}: {stLabel}</Text>
        </View>
      </View>
      <Field icon="package" label={t('chat_deal_card_cargo')} value={localizeCargoName(deal.cargo_desc, lang) || deal.cargo_id || '—'} />
      <Field icon="dollar-sign" label={t('chat_deal_card_price')} value={
        deal.amount != null
          ? (deal.currency ? `${deal.amount} ${deal.currency}` : `${deal.amount}`)
          : '—'
      } />
      {deal.plate ? <Field icon="truck" label={t('chat_deal_card_plate')} value={deal.plate} /> : null}
      {showAutomaticRouteMap ? (
        <View style={[s.autoMap, { borderColor: theme.border, backgroundColor: theme.surfaceAlt }]} testID="deal-automatic-route-map">
          <TruckMap
            routePoints={routePoints}
            planned
            plannedTitle={mapCopy.title}
            plannedHint={mapCopy.hint}
            liveTitle={mapCopy.live}
          />
        </View>
      ) : null}
    </View>
  );
}

export function SystemEventRow({ ev }) {
  const { t } = useI18n();
  const { theme } = useTheme();
  return (
    <View style={s.sysRow} testID="deal-system-event">
      <View style={[s.sysPill, { backgroundColor: theme.border }]}>
        <Feather name="info" size={11} color={theme.textMuted} />
        <Text style={[s.sysText, { color: theme.textMuted }]}>{systemEventText(t, ev)}</Text>
      </View>
    </View>
  );
}

export function DealQuickActions({ role, onOfferPrice, onAcceptBid, onSendDocument, onCallSupport }) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const accent = accentFor(role);
  // Недоступные в текущем состоянии действия НЕ показываем вовсе (раньше висели
  // серыми «мёртвыми» кнопками — владелец справедливо принял их за баг). Кнопка
  // рендерится только когда есть реальный обработчик.
  const Action = ({ icon, label, onPress }) => {
    if (typeof onPress !== 'function') return null;
    return (
      <TouchableOpacity
        style={[s.qa, { borderColor: theme.border }]}
        onPress={onPress}
        testID={`deal-qa-${icon}`}
      >
        <Feather name={icon} size={16} color={accent} />
        <Text style={[s.qaText, { color: theme.text }]} numberOfLines={1}>{label}</Text>
      </TouchableOpacity>
    );
  };
  return (
    <View style={s.qaRow} testID="deal-quick-actions">
      <Action icon="tag" label={t('chat_quick_action_offer_price')} onPress={onOfferPrice} />
      <Action icon="check-circle" label={t('chat_quick_action_accept_bid')} onPress={onAcceptBid} />
      <Action icon="file-text" label={t('chat_quick_action_send_document')} onPress={onSendDocument} />
      <Action icon="life-buoy" label={t('chat_quick_action_call_support')} onPress={onCallSupport} />
    </View>
  );
}

export function DealDocumentsPlaceholder() {
  const { t } = useI18n();
  const { theme } = useTheme();
  return (
    <View style={[s.docs, { borderColor: theme.border }]} testID="deal-documents-placeholder">
      <View style={s.docsHead}>
        <Feather name="folder" size={14} color={theme.textMuted} />
        <Text style={[s.docsTitle, { color: theme.text }]}>{t('chat_documents_title')}</Text>
      </View>
      <Text style={[s.docsHint, { color: theme.textMuted }]}>{t('chat_documents_pending')}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, borderLeftWidth: 4, padding: 12, marginBottom: 8, gap: 6 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  route: { fontSize: 15, fontWeight: '900', flex: 1 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 11, fontWeight: '800' },
  field: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  fieldLabel: { fontSize: 12 },
  fieldValue: { fontSize: 12, fontWeight: '700', flex: 1, textAlign: 'right' },
  autoMap: { height: 250, marginTop: 8, borderWidth: 1, borderRadius: 14, overflow: 'hidden', backgroundColor: '#EAF1ED' },
  sysRow: { alignItems: 'center', marginVertical: 6 },
  sysPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, maxWidth: '90%' },
  sysText: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
  qaRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 2, paddingBottom: 4 },
  qa: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 6, alignItems: 'center', gap: 2 },
  qaText: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  docs: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderStyle: 'dashed', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, marginBottom: 8 },
  docsHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  docsTitle: { fontSize: 12, fontWeight: '800' },
  docsHint: { fontSize: 11, flex: 1 },
});