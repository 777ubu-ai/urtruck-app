import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, Pressable, ScrollView, Linking, Platform,
} from 'react-native';
import { useTheme } from '../utils/ThemeContext';
import { useI18n } from '../utils/useI18n';

// HelpButton — кнопка [?] в углу экрана с раскрывающейся шторкой FAQ.
// Спека (driver_onboarding §3): «На каждом экране регистрации закреплена
// кнопка [?] в верхнем правом углу. При нажатии выкатывается Bottom Sheet
// с ответами на типовые вопросы + крупной кнопкой ‘Написать в техподдержку’».
//
// Пропы:
//   topics:  массив { q, a } для конкретного экрана. Если не передать —
//            используется дефолтный набор для регистрации.
//   support: куда вести при нажатии на «Написать в техподдержку».
//            По умолчанию — wa.me/77479171118 (UrTruck support).
//   accent:  цвет акцента (бренд по роли). По умолчанию #168A5B.

const DEFAULT_SUPPORT = 'https://wa.me/77479171118';

export default function HelpButton({ topics, support = DEFAULT_SUPPORT, accent = '#168A5B', style }) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const items = topics && topics.length ? topics : [
    { q: t('help_q_photo_passport'), a: t('help_a_photo_passport') },
    { q: t('help_q_how_long'),       a: t('help_a_how_long') },
    { q: t('help_q_data_safe'),      a: t('help_a_data_safe') },
  ];

  const openSupport = () => {
    Linking.openURL(support).catch(() => {});
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={[s.btn, { backgroundColor: theme.card, borderColor: theme.border }, style]}
        activeOpacity={0.7}
        accessibilityLabel={t('help_title')}
      >
        <Text style={[s.btnText, { color: theme.text }]}>?</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[s.sheet, { backgroundColor: theme.card }]} onPress={(e) => e.stopPropagation()}>
            <View style={s.handle} />
            <Text style={[s.title, { color: theme.text }]}>{t('help_title')}</Text>

            <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ paddingBottom: 12 }}>
              {items.map((item, idx) => (
                <View key={idx} style={[s.qa, { borderColor: theme.border }]}>
                  <Text style={[s.q, { color: theme.text }]}>{item.q}</Text>
                  <Text style={[s.a, { color: theme.textMuted || '#9CA3AF' }]}>{item.a}</Text>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity
              onPress={openSupport}
              style={[s.supportBtn, { backgroundColor: accent }]}
              activeOpacity={0.85}
            >
              <Text style={s.supportBtnText}>{t('help_contact_support')}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setOpen(false)} style={s.closeBtn}>
              <Text style={[s.closeText, { color: theme.textMuted || '#9CA3AF' }]}>{t('close') || 'Закрыть'}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  btn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  btnText: { fontSize: 16, fontWeight: '800' },
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: Platform.OS === 'ios' ? 32 : 20,
    maxHeight: '80%',
  },
  handle: {
    alignSelf: 'center', width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)', marginBottom: 14,
  },
  title: { fontSize: 18, fontWeight: '800', marginBottom: 14 },
  qa: {
    paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  q: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  a: { fontSize: 13, lineHeight: 18 },
  supportBtn: {
    marginTop: 14, paddingVertical: 14, borderRadius: 12,
    alignItems: 'center',
  },
  supportBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  closeBtn: { alignItems: 'center', marginTop: 10, paddingVertical: 8 },
  closeText: { fontSize: 13, fontWeight: '600' },
});
