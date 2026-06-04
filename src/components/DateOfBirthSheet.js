// DateOfBirthSheet — bottom-sheet выбора даты рождения (P0 hotfix).
// Вместо «голого» numeric-ввода: три колонки День / Месяц / Год,
// оптимизированы под дату рождения (годы от 18 до 100 лет назад, сразу
// близко к нужному). Вывод строго DD.MM.YYYY. Валидация: полная дата,
// корректный день для месяца/года, возраст 18–100, не в будущем.
// Без новых зависимостей — обычные ScrollView-колонки.

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, Pressable, Modal, ScrollView, StyleSheet, Platform,
} from 'react-native';
import { useI18n } from '../utils/useI18n';
import { brand, radius, typography } from '../theme/brandV2';

const pad2 = (n) => String(n).padStart(2, '0');
const daysInMonth = (m, y) => new Date(y, m, 0).getDate(); // m: 1..12

function parseInitial(v) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(v || '').trim());
  if (m) {
    const d = +m[1], mo = +m[2], y = +m[3];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return { d, mo, y };
  }
  return null;
}

export default function DateOfBirthSheet({ visible, initial, onCancel, onConfirm }) {
  const { t } = useI18n();
  const now = new Date();
  const maxYear = now.getFullYear() - 18;     // не моложе 18
  const minYear = now.getFullYear() - 100;    // не старше 100
  const defaultYear = now.getFullYear() - 30; // удобный старт

  const init = parseInitial(initial);
  const [day, setDay] = useState(init?.d || 1);
  const [month, setMonth] = useState(init?.mo || 1);
  const [year, setYear] = useState(init?.y || defaultYear);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (visible) {
      const ii = parseInitial(initial);
      setDay(ii?.d || 1); setMonth(ii?.mo || 1); setYear(ii?.y || defaultYear);
      setError(null);
    }
  }, [visible]);

  const MONTHS = [
    t('month_1'), t('month_2'), t('month_3'), t('month_4'), t('month_5'), t('month_6'),
    t('month_7'), t('month_8'), t('month_9'), t('month_10'), t('month_11'), t('month_12'),
  ];

  const maxDay = daysInMonth(month, year);
  const days = Array.from({ length: maxDay }, (_, i) => i + 1);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => maxYear - i); // свежие сверху

  const clampedDay = Math.min(day, maxDay);

  const onDone = () => {
    const d = Math.min(day, daysInMonth(month, year));
    const date = new Date(year, month - 1, d);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== d) {
      setError(t('dob_err_invalid')); return;
    }
    if (date > now) { setError(t('dob_err_future')); return; }
    const age = now.getFullYear() - year - ((now.getMonth() + 1 < month || (now.getMonth() + 1 === month && now.getDate() < d)) ? 1 : 0);
    if (age < 18 || age > 100) { setError(t('dob_err_age')); return; }
    onConfirm(`${pad2(d)}.${pad2(month)}.${year}`);
  };

  const Column = ({ data, value, onSelect, render, testID }) => {
    const ref = useRef(null);
    return (
      <ScrollView
        ref={ref}
        style={s.col}
        contentContainerStyle={s.colContent}
        showsVerticalScrollIndicator={false}
        testID={testID}
      >
        {data.map((item) => {
          const active = item === value;
          return (
            <Pressable key={item} onPress={() => { onSelect(item); setError(null); }} style={[s.cell, active && s.cellActive]}>
              <Text style={[s.cellText, active && s.cellTextActive]}>{render ? render(item) : item}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={s.backdrop} onPress={onCancel}>
        <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()} testID="dob-sheet">
          <View style={s.handle} />
          <Text style={s.title}>{t('dob_title')}</Text>
          <View style={s.cols}>
            <Column data={days} value={clampedDay} onSelect={setDay} testID="dob-day" />
            <Column data={months} value={month} onSelect={setMonth} render={(m) => MONTHS[m - 1]} testID="dob-month" />
            <Column data={years} value={year} onSelect={setYear} testID="dob-year" />
          </View>
          {error ? <Text style={s.err}>{error}</Text> : null}
          <Pressable style={s.doneBtn} onPress={onDone} testID="dob-done">
            <Text style={s.doneText}>{t('dob_done')}</Text>
          </Pressable>
          <Pressable style={s.cancelBtn} onPress={onCancel}>
            <Text style={s.cancelText}>{t('not_now')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: brand.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: Platform.OS === 'ios' ? 32 : 20,
  },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: brand.border, marginBottom: 14 },
  title: { ...typography.h1, fontSize: 20, lineHeight: 26, color: brand.textPrimary, marginBottom: 12, textAlign: 'center' },
  cols: { flexDirection: 'row', gap: 8, height: 200 },
  col: { flex: 1, backgroundColor: brand.surfaceMuted, borderRadius: radius.md },
  colContent: { paddingVertical: 8 },
  cell: { paddingVertical: 10, alignItems: 'center', borderRadius: radius.sm },
  cellActive: { backgroundColor: brand.primarySoft },
  cellText: { ...typography.body, color: brand.textSecondary },
  cellTextActive: { color: brand.primary, fontWeight: '800' },
  err: { ...typography.caption, color: brand.error || '#EF4444', marginTop: 10, textAlign: 'center' },
  doneBtn: { marginTop: 16, height: 52, borderRadius: radius.md, backgroundColor: brand.primary, alignItems: 'center', justifyContent: 'center' },
  doneText: { ...typography.button, color: brand.textOnPrimary },
  cancelBtn: { alignItems: 'center', marginTop: 10, paddingVertical: 8 },
  cancelText: { ...typography.bodySmall, fontWeight: '600', color: brand.textSecondary },
});
