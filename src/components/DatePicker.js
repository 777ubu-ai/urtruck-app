import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Modal } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '../utils/ThemeContext';
import { useI18n } from '../utils/useI18n';

const MONTHS = {
  RU: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
  EN: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

export default function DatePicker({ value, onChange, onClose, placeholder = 'DD.MM.YYYY', style, min, max, defaultOpen = false }) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [showPicker, setShowPicker] = useState(defaultOpen === true);
  const dismiss = () => { setShowPicker(false); onClose && onClose(); };

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const parseVal = () => {
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value || '');
    return m ? { d: +m[1], m: +m[2], y: +m[3] } : null;
  };
  const selected = parseVal();

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const offset = firstDay === 0 ? 6 : firstDay - 1;
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const pick = (day) => {
    const picked = new Date(viewYear, viewMonth, day);
    if (picked < todayStart) return;
    const d = String(day).padStart(2, '0');
    const m = String(viewMonth + 1).padStart(2, '0');
    onChange(`${d}.${m}.${viewYear}`);
    setShowPicker(false);
  };

  const calendarGrid = (
    <View style={[s.cal, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={s.calHeader}>
        <TouchableOpacity onPress={() => {
          if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
          else setViewMonth(viewMonth - 1);
        }}>
          <Text style={[s.navArrow, { color: theme.text }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[s.calTitle, { color: theme.text }]}>
          {MONTHS.EN[viewMonth]} {viewYear}
        </Text>
        <TouchableOpacity onPress={() => {
          if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
          else setViewMonth(viewMonth + 1);
        }}>
          <Text style={[s.navArrow, { color: theme.text }]}>›</Text>
        </TouchableOpacity>
      </View>
      <View style={s.weekRow}>
        {['Mo','Tu','We','Th','Fr','Sa','Su'].map(d => (
          <Text key={d} style={[s.weekDay, { color: theme.textMuted }]}>{d}</Text>
        ))}
      </View>
      <View style={s.daysGrid}>
        {[...Array(offset)].map((_, i) => <View key={'e' + i} style={s.dayCell} />)}
        {[...Array(daysInMonth)].map((_, i) => {
          const day = i + 1;
          const isSelected = selected && selected.d === day && selected.m === viewMonth + 1 && selected.y === viewYear;
          const dayDate = new Date(viewYear, viewMonth, day);
          const isPast = dayDate < todayStart;
          const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
          return (
            <TouchableOpacity
              key={day}
              style={[
                s.dayCell,
                isSelected && { backgroundColor: '#168759' },
                isToday && !isSelected && { borderWidth: 1.5, borderColor: '#168759' },
                isPast && { opacity: 0.25 },
              ]}
              disabled={isPast}
              onPress={() => pick(day)}
            >
              <Text style={[s.dayText, { color: isSelected ? '#fff' : theme.text }]}>{day}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderDisplay = () => (
    <TouchableOpacity
      style={[s.input, { backgroundColor: theme.card, borderColor: theme.border }]}
      onPress={() => setShowPicker(true)}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Feather name="calendar" size={15} color={value ? theme.text : theme.textMuted} />
        <Text style={[s.inputText, { color: value ? theme.text : theme.textMuted }]}>
          {value || placeholder}
        </Text>
      </View>
    </TouchableOpacity>
  );

  if (Platform.OS === 'web') {
    return (
      <View style={[s.wrapper, style]}>
        {!defaultOpen && !showPicker && renderDisplay()}
        {showPicker && calendarGrid}
      </View>
    );
  }

  return (
    <View style={[s.wrapper, style]}>
      {!defaultOpen && !showPicker && renderDisplay()}
      <Modal visible={showPicker} transparent animationType="fade" onRequestClose={dismiss}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={dismiss}>
          <TouchableOpacity activeOpacity={1}>
            {calendarGrid}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  wrapper: { marginBottom: 10 },
  input: { borderRadius: 12, padding: 14, borderWidth: 1 },
  inputText: { fontSize: 14, fontWeight: '500' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  cal: { width: 320, maxWidth: '100%', borderRadius: 16, padding: 16, borderWidth: 1 },
  calHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  navArrow: { fontSize: 28, fontWeight: '700', paddingHorizontal: 14 },
  calTitle: { fontSize: 16, fontWeight: '800' },
  weekRow: { flexDirection: 'row', marginBottom: 8 },
  weekDay: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600' },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  dayText: { fontSize: 14, fontWeight: '500' },
});
