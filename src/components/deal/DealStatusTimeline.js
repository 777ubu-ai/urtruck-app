import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

import { useI18n } from '../../utils/useI18n';
import { localizePlace } from '../../utils/places';
import { useV1Colors } from '../../theme/designV1';
import { systemEventText } from './DealRoom';

const COPY = {
  RU: { empty: 'История рейса пока пуста', location: 'Место', actor: 'Кто обновил' },
  EN: { empty: 'Trip history is empty', location: 'Location', actor: 'Updated by' },
  ZH: { empty: '暂无运输记录', location: '地点', actor: '更新者' },
  KK: { empty: 'Рейс тарихы әзірге бос', location: 'Орын', actor: 'Жаңартқан' },
};

const ICON_BY_EVENT = {
  bid_accepted: 'check-circle',
  deal_created: 'briefcase',
  created: 'briefcase',
  accepted: 'check-circle',
  in_progress: 'truck',
  trip_started: 'truck',
  at_border: 'map-pin',
  border_crossed: 'check-square',
  delivered: 'package',
  completed: 'flag',
  cancelled: 'x-circle',
  rejected: 'x-circle',
};

function textValue(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  return '';
}

function firstText(...values) {
  for (const value of values) {
    const text = textValue(value);
    if (text) return text;
  }
  return '';
}

function eventKey(ev) {
  const payload = ev?.payload || {};
  return firstText(payload.status, ev?.status, ev?.event_type, ev?.i18n_key)
    .replace(/^deal_event[._-]/, '')
    .replace(/^status_changed[._-]?/, '');
}

function formatMoment(ev, lang) {
  const raw = firstText(ev?.created_at, ev?.occurred_at, ev?.timestamp, ev?.at, ev?.updated_at);
  if (!raw) return '';
  let source = raw;
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(source) && !/[zZ]|[+\-]\d{2}:?\d{2}$/.test(source)) {
    source = source.replace(' ', 'T') + 'Z';
  }
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) return raw;
  const locale = String(lang || '').toUpperCase() === 'ZH'
    ? 'zh-CN'
    : String(lang || '').toUpperCase() === 'EN'
      ? 'en-GB'
      : String(lang || '').toUpperCase() === 'KK'
        ? 'kk-KZ'
        : 'ru-RU';
  try {
    return new Intl.DateTimeFormat(locale, {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

function detailsFor(ev) {
  const p = ev?.payload || {};
  return {
    place: firstText(
      ev?.location_name, ev?.location, ev?.place, ev?.city,
      p.location_name, p.location, p.place, p.city, p.border_name,
    ),
    actor: firstText(ev?.actor_name, ev?.actor, ev?.updated_by, p.actor_name, p.actor, p.updated_by),
    detail: firstText(ev?.comment, ev?.reason, ev?.description, ev?.details, p.comment, p.reason, p.description, p.details),
  };
}

export default function DealStatusTimeline({ events = [], fallbackStatus = '' }) {
  const { t, lang } = useI18n();
  const colors = useV1Colors();
  const ui = COPY[lang] || COPY.RU;

  if (!events.length) {
    return (
      <View style={s.empty} testID="deal-status-timeline-empty">
        <Feather name="activity" size={22} color="#168759" />
        <Text style={[s.emptyTitle, { color: colors.text }]}>{fallbackStatus || ui.empty}</Text>
        {fallbackStatus ? <Text style={[s.emptyHint, { color: colors.textMuted }]}>{ui.empty}</Text> : null}
      </View>
    );
  }

  return (
    <View style={s.list} testID="deal-status-timeline">
      {events.map((ev, index) => {
        const key = eventKey(ev);
        const meta = detailsFor(ev);
        const title = systemEventText(t, ev);
        const moment = formatMoment(ev, lang);
        const localizedPlace = meta.place ? (localizePlace(meta.place, lang) || meta.place) : '';
        const last = index === events.length - 1;
        return (
          <View key={String(ev?.id || `${key}-${index}`)} style={s.item} testID="deal-status-timeline-item">
            <View style={s.rail}>
              <View style={[s.dot, { borderColor: '#168759', backgroundColor: '#FFFFFF' }]}>
                <Feather name={ICON_BY_EVENT[key] || 'circle'} size={12} color="#168759" />
              </View>
              {!last ? <View style={s.line} /> : null}
            </View>

            <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[s.title, { color: colors.text }]}>{title}</Text>
              {moment ? <Text style={[s.moment, { color: colors.textMuted }]}>{moment}</Text> : null}
              {localizedPlace ? (
                <View style={s.metaRow}>
                  <Feather name="map-pin" size={13} color="#168759" />
                  <Text style={[s.metaText, { color: colors.text }]}>{localizedPlace}</Text>
                </View>
              ) : null}
              {meta.actor ? (
                <View style={s.metaRow}>
                  <Feather name="user" size={13} color={colors.textMuted} />
                  <Text style={[s.metaText, { color: colors.textMuted }]}>{ui.actor}: {meta.actor}</Text>
                </View>
              ) : null}
              {meta.detail ? <Text style={[s.detail, { color: colors.textMuted }]}>{meta.detail}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  list: { paddingHorizontal: 4, paddingTop: 6, paddingBottom: 24 },
  item: { flexDirection: 'row', alignItems: 'stretch', minHeight: 82 },
  rail: { width: 34, alignItems: 'center' },
  dot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  line: { width: 2, flex: 1, minHeight: 52, backgroundColor: '#CFE9DB', marginVertical: -1 },
  card: { flex: 1, borderWidth: 1, borderRadius: 15, paddingHorizontal: 13, paddingVertical: 11, marginBottom: 12 },
  title: { fontSize: 14, fontWeight: '900', lineHeight: 19 },
  moment: { fontSize: 11.5, fontWeight: '700', marginTop: 3, marginBottom: 7 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  metaText: { flex: 1, fontSize: 12, fontWeight: '650', lineHeight: 17 },
  detail: { fontSize: 12, lineHeight: 17, marginTop: 7 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  emptyTitle: { fontSize: 15, fontWeight: '900', textAlign: 'center', marginTop: 10 },
  emptyHint: { fontSize: 12, textAlign: 'center', marginTop: 5 },
});