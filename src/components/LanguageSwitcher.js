// LanguageSwitcher — pill button + bottom-sheet picker.
//
// Stage 45: вынесли из OnboardingScreen чтобы language switch был
// доступен ДО регистрации (RoleScreen, FeedScreen в гостевом режиме).
// Раньше единственная точка переключения языка была в Onboarding и
// Profile (после регистрации). Гость заходил на urtruck.kz и не мог
// поменять язык — это и просил починить владелец.
//
// Список LANGS совпадает с тем что в i18n.translations — добавляя
// сюда новый код не забудь и там.

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, ScrollView,
} from 'react-native';
import { setLanguage, getLanguage, subscribeToLanguage } from '../utils/i18n';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';

// Список совпадает с translations в utils/i18n.js — добавляя сюда
// новый код, не забудь и там. UZ/KG/DE/… отброшены в i18n (см. шапку
// файла), поэтому в pickerе их тоже нет.
//
// Stage 49 P0 fix: code = ISO 639-1 (RU/KK/EN/ZH) для совпадения с
// translations[…] ключами. display — это то что показывается в pill
// (KZ/CN привычнее видеть пользователю чем KK/ZH). До фикса LANGS
// использовал code='KZ'/'CN' и setLanguage('KZ') клал
// translations['KZ'] = undefined → t() fallback на RU → пользователь
// видел рус-текст после выбора казахского/китайского, хотя pill
// менялся. Reload спасал благодаря LEGACY_LANG_FIX в i18n.js.
const LANGS = [
  { code: 'RU', display: 'RU', label: 'Русский', flag: '🇷🇺' },
  { code: 'KK', display: 'KZ', label: 'Қазақша', flag: '🇰🇿' },
  { code: 'EN', display: 'EN', label: 'English', flag: '🇬🇧' },
  { code: 'ZH', display: 'CN', label: '中文',      flag: '🇨🇳' },
];

export default function LanguageSwitcher({ style, testID = 'language-switcher', compact = false }) {
  const { t } = useI18n();
  const { theme, isDark } = useTheme();
  const [open, setOpen] = useState(false);
  const [, setTick] = useState(0);

  // Re-render when language changes from anywhere else (i.e. another
  // mounted LanguageSwitcher on a different screen).
  React.useEffect(() => subscribeToLanguage(() => setTick(n => n + 1)), []);

  const current = LANGS.find(l => l.code === getLanguage()) || LANGS[0];
  const pick = (code) => { setLanguage(code); setOpen(false); };

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={[
          s.pill,
          { borderColor: theme.border, backgroundColor: theme.card },
          style,
        ]}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={t('language_label') || 'Language'}
      >
        <Text style={{ fontSize: 14 }}>{current.flag}</Text>
        {!compact && (
          <Text style={[s.code, { color: theme.text }]}>{current.display}</Text>
        )}
      </TouchableOpacity>

      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            style={[
              s.sheet,
              {
                backgroundColor: theme.cardElevated || theme.card,
                borderColor: theme.border,
              },
            ]}
          >
            <View
              style={[
                s.handle,
                { backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(15,23,42,0.15)' },
              ]}
            />
            <Text style={[s.title, { color: theme.text }]}>
              {t('language_label') || 'Язык'}
            </Text>
            <ScrollView style={{ width: '100%' }}>
              {LANGS.map(l => {
                const active = l.code === current.code;
                return (
                  <TouchableOpacity
                    key={l.code}
                    style={[
                      s.row,
                      active && { backgroundColor: 'rgba(34,197,94,0.10)' },
                    ]}
                    onPress={() => pick(l.code)}
                    // testID использует display (kz/cn), чтобы не
                    // ломать существующие Stage 45 Playwright spec'и.
                    testID={`lang-${l.display.toLowerCase()}`}
                  >
                    <Text style={{ fontSize: 22 }}>{l.flag}</Text>
                    <Text style={[s.rowText, { color: theme.text }]}>{l.label}</Text>
                    {active && <Text style={{ color: '#168A5B', fontSize: 16, fontWeight: '700' }}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  code: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(10,15,26,0.85)',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
    maxHeight: '70%',
    alignItems: 'center',
    borderWidth: 1,
  },
  handle: { width: 40, height: 4, borderRadius: 2, marginBottom: 14 },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  rowText: { flex: 1, fontSize: 15, fontWeight: '600' },
});
