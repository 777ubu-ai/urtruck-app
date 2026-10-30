// Одна компактная кнопка и общий доступный список языков для всех экранов.
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import translations, { setLanguage } from '../utils/i18n';
import { useI18n } from '../utils/useI18n';
import { LANGUAGES } from '../utils/languages';
import { useTheme } from '../utils/ThemeContext';
import CountryFlag from './ui/v1/CountryFlag';

export default function LanguageSwitcher({ style, testID = 'language-switcher', compact = false, optionTestIDPrefix = 'lang' }) {
  const { t, lang } = useI18n();
  const { theme, isDark } = useTheme();
  const [open, setOpen] = useState(false);
  // Неполный словарь никогда не должен появляться в пользовательском списке.
  const options = LANGUAGES.filter(item => translations[item.code]);
  const current = options.find(item => item.code === lang) || options[0];
  const close = () => setOpen(false);
  const pick = code => { setLanguage(code); close(); };

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={[s.pill, { borderColor: theme.border, backgroundColor: theme.card }, style]}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${t('language_label')}: ${current.label}`}
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
      >
        <Feather name="globe" size={16} color={theme.text} />
        <Text style={[s.code, { color: theme.text }]} numberOfLines={1}>{current.display}</Text>
        {!compact && <Feather name="chevron-down" size={13} color={theme.textMuted} />}
      </TouchableOpacity>

      <Modal transparent visible={open} animationType="slide" onRequestClose={close}>
        <Pressable style={s.backdrop} onPress={close} testID={`${testID}-backdrop`}>
          <Pressable style={[s.sheet, { backgroundColor: isDark ? '#151E19' : '#FFFFFF', borderColor: theme.border }]} accessibilityViewIsModal>
            <View style={s.heading}>
              <Text style={[s.title, { color: theme.text }]} accessibilityRole="header">{t('language_label')}</Text>
              <TouchableOpacity onPress={close} style={s.close} accessibilityRole="button" accessibilityLabel={t('close')} testID={`${testID}-close`}>
                <Feather name="x" size={22} color={theme.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={s.list} contentContainerStyle={s.listContent} keyboardShouldPersistTaps="handled">
              {options.map(item => {
                const active = item.code === current.code;
                const optionId = optionTestIDPrefix === 'profile-lang' ? item.code : item.display;
                return (
                  <TouchableOpacity
                    key={item.code}
                    style={[s.row, active && { backgroundColor: isDark ? '#203329' : '#E8F6EF', borderColor: '#168759' }]}
                    onPress={() => pick(item.code)}
                    testID={`${optionTestIDPrefix}-${optionId.toLowerCase()}`}
                    accessibilityRole="radio"
                    accessibilityLabel={item.label}
                    accessibilityState={{ selected: active, checked: active }}
                    aria-checked={active}
                  >
                    <CountryFlag code={item.country} width={24} accessibilityLabel={item.label} />
                    <Text style={[s.rowText, { color: theme.text }]}>{item.label}</Text>
                    <View style={[s.check, { borderColor: active ? '#168759' : theme.border }, active && s.checkSelected]}>{active && <Feather name="check" size={14} color="#FFFFFF" />}</View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <SafeAreaView edges={['bottom']} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 22, paddingHorizontal: 11, minHeight: 44, minWidth: 70 },
  code: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10,15,26,0.55)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, maxHeight: '75%', width: '100%', maxWidth: 480, alignSelf: 'center', borderWidth: 1 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 12, paddingBottom: 4 },
  title: { flex: 1, fontSize: 18, fontWeight: '700' },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  list: { width: '100%', flexShrink: 1 },
  listContent: { paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 12, paddingHorizontal: 12, marginVertical: 3, borderWidth: 1, borderColor: 'transparent', borderRadius: 12 },
  rowText: { flex: 1, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  checkSelected: { backgroundColor: '#168759' },
});
