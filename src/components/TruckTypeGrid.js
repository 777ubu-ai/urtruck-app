// Сетка выбора типа кузова (референс владельца 14.06): белые карточки,
// иконка-набор владельца, выбранный — рамка акцента + галочка. Сначала
// ходовые типы, остальные — по кнопке «Другие типы ›». Карточки всегда
// белые (как на референсе), поэтому видно и в тёмной теме.
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useI18n } from '../utils/useI18n';
import { TRUCK_KEYS } from '../utils/truckConstants';
import TruckTypeIcon from './TruckTypeIcon';

const PRIMARY = ['tent', 'ref', 'izoterm', 'cont20', 'cont40', 'platform', 'tanker', 'dumptruck'];
const REST = TRUCK_KEYS.filter((k) => !PRIMARY.includes(k));

export default function TruckTypeGrid({ value, onSelect, accent = '#168759' }) {
  const { t } = useI18n();
  const [showAll, setShowAll] = useState(false);
  const keys = showAll ? [...PRIMARY, ...REST] : PRIMARY;
  return (
    <View>
      <View style={s.grid}>
        {keys.map((k) => {
          const sel = value === k;
          return (
            <TouchableOpacity
              key={k}
              onPress={() => onSelect(k)}
              activeOpacity={0.8}
              testID={`truck-type-${k}`}
              style={[s.card, sel ? { borderColor: accent, borderWidth: 2 } : { borderColor: '#E7E5E4' }]}
            >
              {sel ? (
                <View style={[s.check, { backgroundColor: accent }]}>
                  <Text style={s.checkT}>✓</Text>
                </View>
              ) : null}
              <TruckTypeIcon type={k} width={58} />
              <Text style={s.lbl} numberOfLines={2}>{t(k)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {!showAll ? (
        <TouchableOpacity onPress={() => setShowAll(true)} style={s.more} testID="truck-more-types">
          <Text style={[s.moreT, { color: accent }]}>{t('truck_more_types')} ›</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  card: {
    width: '31.5%', backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
    paddingVertical: 12, paddingHorizontal: 4, minHeight: 96,
  },
  lbl: { marginTop: 6, fontSize: 11, fontWeight: '700', color: '#44403C', textAlign: 'center' },
  check: { position: 'absolute', top: 6, right: 6, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  checkT: { color: '#fff', fontSize: 11, fontWeight: '900' },
  more: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 20, marginTop: 2 },
  moreT: { fontSize: 14, fontWeight: '800' },
});
