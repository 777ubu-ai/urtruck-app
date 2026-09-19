// Categorized body selector: freight, LCV and special equipment.
// The tabs keep dispatchers from scanning unrelated vehicle classes.
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useI18n } from '../utils/useI18n';
import TruckTypeIcon from './TruckTypeIcon';
import { useV1Colors } from '../theme/designV1';

export const TRUCK_TYPE_GROUPS = {
  freight: ['tent', 'ref', 'izoterm', 'closed', 'container', 'platform', 'tandem', 'longliner'],
  lcv: ['lcv_tent', 'lcv_van', 'lcv_flatbed', 'lcv_ref', 'microvan'],
  special: ['tanker', 'dumptruck', 'auto', 'lowloader', 'grain', 'livestock', 'logger', 'manipulator'],
};

const LEGACY_GROUP = {
  cont20: 'freight', cont40: 'freight', jumbo: 'freight', mega: 'freight', curtain: 'freight',
  open_truck: 'lcv', hazmat: 'special',
};

const tabForValue = (value) => {
  if (!value) return 'freight';
  return Object.entries(TRUCK_TYPE_GROUPS).find(([, keys]) => keys.includes(value))?.[0] || LEGACY_GROUP[value] || 'freight';
};

export default function TruckTypeGrid({ value, onSelect, accent = '#168759' }) {
  const { t } = useI18n();
  const v1 = useV1Colors();
  const initialTab = useMemo(() => tabForValue(value), [value]);
  const [tab, setTab] = useState(initialTab);
  const keys = TRUCK_TYPE_GROUPS[tab];

  return (
    <View>
      <View style={[s.tabs, { backgroundColor: v1.bg, borderColor: v1.border }]} testID="truck-type-tabs">
        {['freight', 'lcv', 'special'].map((key) => {
          const active = tab === key;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => setTab(key)}
              style={[s.tab, active && { backgroundColor: v1.surface, borderColor: accent }]}
              testID={`truck-tab-${key}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text style={[s.tabText, { color: active ? accent : v1.textMuted }]} numberOfLines={2}>
                {t(`truck_group_${key}`)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={s.grid}>
        {keys.map((key) => {
          const selected = value === key
            || (key === 'container' && (value === 'cont20' || value === 'cont40'))
            || (key === 'tent' && value === 'curtain');
          return (
            <TouchableOpacity
              key={key}
              onPress={() => onSelect(key)}
              activeOpacity={0.8}
              testID={`truck-type-${key}`}
              style={[s.card, { backgroundColor: v1.surface, borderColor: v1.border }, selected && { borderColor: accent, borderWidth: 2 }]}
            >
              {selected ? <View style={[s.check, { backgroundColor: accent }]}><Text style={s.checkText}>✓</Text></View> : null}
              <TruckTypeIcon type={key} width={72} />
              <Text style={[s.label, { color: v1.text }]} numberOfLines={2}>{t(key)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {tab === 'freight' ? (
        <Text style={[s.hint, { color: v1.textMuted }]} testID="truck-volume-hint">{t('truck_volume_profile_hint')}</Text>
      ) : null}
      {tab === 'special' ? (
        <Text style={[s.hint, { color: v1.textMuted }]} testID="truck-adr-hint">{t('truck_adr_profile_hint')}</Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  tabs: { flexDirection: 'row', borderWidth: 1, borderRadius: 14, padding: 3, marginBottom: 14, gap: 3 },
  tab: { flex: 1, minHeight: 44, borderRadius: 11, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  tabText: { fontSize: 11, lineHeight: 14, fontWeight: '800', textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  card: { width: '48.5%', borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 12, paddingVertical: 15, paddingHorizontal: 8, minHeight: 126 },
  label: { marginTop: 8, fontSize: 13, lineHeight: 17, fontWeight: '800', textAlign: 'center' },
  check: { position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  checkText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  hint: { fontSize: 12, lineHeight: 17, textAlign: 'center', paddingHorizontal: 8, paddingVertical: 6 },
});
