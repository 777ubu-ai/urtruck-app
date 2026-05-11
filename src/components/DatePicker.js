import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Modal, ScrollView } from 'react-native';
import { useTheme } from '../utils/ThemeContext';
import { useI18n } from '../utils/useI18n';

// DatePicker с календарём
// value формат: "DD.MM.YYYY"
// Web: нативный <input type="date">
// Mobile: собственный календарь (модальное окно с выбором месяца/дня)

const MONTHS = {
  RU: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
  EN: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

const parseIso = (v) => {
  // "DD.MM.YYYY" -> "YYYY-MM-DD" for native input
  if (!v) return undefined; // undefined removes value attr, avoids pattern mismatch
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(v);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : undefined;
};

const formatFromIso = (iso) => {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
};

// Минимум сегодня, максимум +3 месяца
const getMinMaxIso = () => {
  const today = new Date();
  const min = today.toISOString().split('T')[0];
  const max = new Date(today);
  max.setMonth(max.getMonth() + 3);
  return { min, max: max.toISOString().split('T')[0] };
};

export default function DatePicker({ value, onChange, placeholder = 'DD.MM.YYYY', style, min, max }) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [showPicker, setShowPicker] = useState(false);
  const mm = getMinMaxIso();

  // Web: нативный input type=date
  if (Platform.OS === 'web') {
    return (
      <View style={[s.wrapper, style]}>
        <input
          type="date"
          value={parseIso(value)}
          onChange={(e) => onChange(formatFromIso(e.target.value))}
          style={{
            backgroundColor: theme.card,
            color: theme.text,
            border: `1px solid ${theme.border}`,
            borderRadius: 12,
            padding: 14,
            fontSize: 14,
            width: '100%',
            boxSizing: 'border-box',
            fontFamily: 'inherit',
            colorScheme: theme.bg === '#0C0A09' ? 'dark' : 'light',
          }}
          min={min || mm.min}
          max={max || mm.max}
        />
      </View>
    );
  }

  // Mobile: простой календарь
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

  // Stage 52 / P1-8: запрещаем выбор прошлых дат на native.
  // Полночь сегодняшнего дня — границу применяем и к pick(), и к рендеру
  // (disabled-стиль), чтобы пользователь не мог тапнуть прошлый день и не
  // видел его доступным.
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const pick = (day) => {
    const picked = new Date(viewYear, viewMonth, day);
    if (picked < todayStart) return; // P1-8
    const d = String(day).padStart(2, '0');
    const m = String(viewMonth + 1).padStart(2, '0');
    onChange(`${d}.${m}.${viewYear}`);
    setShowPicker(false);
  };

  const renderDisplay = () => (
    <TouchableOpacity
      style={[s.input, { backgroundColor: theme.card, borderColor: theme.border }]}
      onPress={() => setShowPicker(true)}
    >
      <Text style={[s.inputText, { color: value ? theme.text : theme.textMuted }]}>
        📅 {value || placeholder}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={[s.wrapper, style]}>
      {/* P1-7: пока календарь открыт, не показываем preview-полоску — иначе
          на iOS под полупрозрачным overlay'ем видна вторая дата сверху. */}
      {!showPicker && renderDisplay()}
      <Modal visible={showPicker} transparent animationType="fade" onRequestClose={() => setShowPicker(false)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setShowPicker(false)}>
          <TouchableOpacity style={[s.cal, { backgroundColor: theme.card, borderColor: theme.border }]} activeOpacity={1}>
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
                return (
                  <TouchableOpacity
                    key={day}
                    style={[
                      s.dayCell,
                      isSelected && { backgroundColor: '#22C55E' },
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
  cal: { width: 320, borderRadius: 16, padding: 16, borderWidth: 1 },
  calHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  navArrow: { fontSize: 28, fontWeight: '700', paddingHorizontal: 14 },
  calTitle: { fontSize: 16, fontWeight: '800' },
  weekRow: { flexDirection: 'row', marginBottom: 8 },
  weekDay: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600' },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  dayText: { fontSize: 14, fontWeight: '500' },
});
