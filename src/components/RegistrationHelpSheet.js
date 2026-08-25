// RegistrationHelpSheet — Help/FAQ bottom-sheet для мастера регистрации
// водителя (PR-A). Controlled-модалка (visible/onClose), как
// RegistrationCloseModal: общего registration-layout нет, поэтому подключается
// в каждый экран мастера и открывается из кнопки [?] в шапке.
//
// Не использует AppNavigator route (по требованию) — это Modal. Темы FAQ:
// требования к водителю, как фотографировать, срок проверки (24–48 часов),
// отклонённая заявка, связь с поддержкой. Тексты короткие и практичные;
// единый срок — только 24–48 часов; формулировки UrTruck (грузы/рейсы/
// водитель/авто), без passenger/taxi-лексики.

import React, { useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  StyleSheet,
  Linking,
  Platform,
  Alert,
} from 'react-native';
import { useI18n } from '../utils/useI18n';
import { brand, useBrand, radius, typography } from '../theme/brandV2';

// Тот же канал поддержки UrTruck, что и в HelpButton.js (не PII пользователя —
// корпоративная линия поддержки, уже зашита в приложении).
const SUPPORT_URL = 'https://wa.me/77479171118';

export default function RegistrationHelpSheet({ visible, onClose }) {
  const localBrand = useBrand();
  const s = useMemo(() => makeStyles(localBrand), [localBrand]);
  const { t } = useI18n();

  const topics = [
    { q: t('reg_help_req_q'), a: t('reg_help_req_a') },
    { q: t('reg_help_photos_q'), a: t('reg_help_photos_a') },
    { q: t('reg_help_review_q'), a: t('reg_help_review_a') },
    { q: t('reg_help_rejected_q'), a: t('reg_help_rejected_a') },
    { q: t('reg_help_support_q'), a: t('reg_help_support_a') },
  ];

  const openSupport = async () => {
    // Не «мёртвая» кнопка: если WhatsApp/браузер не открылся — показываем
    // контакт, чтобы пользователь всё равно мог написать.
    try {
      await Linking.openURL(SUPPORT_URL);
    } catch {
      Alert.alert(t('reg_help_support_q'), 'WhatsApp: +7 747 917 11 18');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()} testID="reg-help-sheet">
          <View style={s.handle} />
          <Text style={s.title}>{t('reg_help_title')}</Text>

          <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
            {topics.map((item, idx) => (
              <View key={idx} style={s.qa}>
                <Text style={s.q}>{item.q}</Text>
                <Text style={s.a}>{item.a}</Text>
              </View>
            ))}
          </ScrollView>

          <Pressable onPress={openSupport} style={s.supportBtn} testID="reg-help-support">
            <Text style={s.supportBtnText}>{t('reg_help_contact_btn')}</Text>
          </Pressable>
          <Pressable onPress={onClose} style={s.closeBtn} testID="reg-help-close">
            <Text style={s.closeText}>{t('reg_help_close')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (brand) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: brand.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 32 : 20,
    maxHeight: '80%',
  },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: brand.border, marginBottom: 14 },
  title: { ...typography.h1, fontSize: 20, lineHeight: 26, color: brand.textPrimary, marginBottom: 12 },
  // P0 fix: ScrollView ужимается (flexShrink), а кнопки поддержки/закрытия
  // остаются ниже и не перекрывают текст (раньше fixed maxHeight 380 на
  // маленьком экране выталкивал «Заявка не прошла проверку» под кнопку).
  scroll: { flexGrow: 0, flexShrink: 1 },
  scrollContent: { paddingBottom: 12 },
  qa: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: brand.border },
  q: { ...typography.bodyLarge, fontWeight: '800', color: brand.textPrimary, marginBottom: 4 },
  a: { ...typography.bodySmall, color: brand.textSecondary, lineHeight: 19 },
  supportBtn: { marginTop: 16, height: 52, borderRadius: radius.md, backgroundColor: brand.primary, alignItems: 'center', justifyContent: 'center' },
  supportBtnText: { ...typography.button, color: brand.textOnPrimary },
  closeBtn: { alignItems: 'center', marginTop: 10, paddingVertical: 8 },
  closeText: { ...typography.bodySmall, fontWeight: '600', color: brand.textSecondary },
});
