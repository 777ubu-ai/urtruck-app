// RegistrationCloseModal — confirm-modal закрытия регистрации (ТЗ блок 10).
//
// Переиспользуемый компонент (как BidModal/RatingModal): нет общего
// registration-layout, поэтому подключается в каждый экран мастера.
// Перед выходом best-effort сохраняет черновик текущего экрана через проп
// saveDraft (если передан) — фото и пройденные шаги уже persist server-side,
// здесь дописываем только несохранённые локальные поля. Если save упал —
// НЕ выходим молча: показываем ошибку и остаёмся на экране.

import React, { useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet, ActivityIndicator } from 'react-native';
import { useI18n } from '../utils/useI18n';
import { brand, radius, typography } from '../theme/brandV2';

export default function RegistrationCloseModal({ visible, onCancel, onExit, saveDraft }) {
  const { t } = useI18n();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const onYes = async () => {
    setFailed(false);
    if (saveDraft) {
      setSaving(true);
      try {
        await saveDraft();
      } catch (e) {
        setSaving(false);
        setFailed(true); // не выходим молча — save не прошёл
        return;
      }
      setSaving(false);
    }
    onExit();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={saving ? undefined : onCancel}>
      <View style={s.backdrop}>
        <View style={s.card} testID="reg-close-modal">
          <Text style={s.title}>{t('registration_close_title')}</Text>
          <Text style={s.text}>{t('registration_close_text')}</Text>
          {saving ? <Text style={s.saving}>{t('registration_close_saving')}</Text> : null}
          {failed ? <Text style={s.failed}>{t('registration_close_save_failed')}</Text> : null}
          <View style={s.row}>
            <Pressable onPress={onCancel} disabled={saving} style={[s.btn, s.btnGhost]} testID="reg-close-no">
              <Text style={s.btnGhostText}>{t('registration_close_no')}</Text>
            </Pressable>
            <Pressable onPress={onYes} disabled={saving} style={[s.btn, s.btnPrimary, saving && { opacity: 0.6 }]} testID="reg-close-yes">
              {saving ? (
                <ActivityIndicator color={brand.textOnPrimary} />
              ) : (
                <Text style={s.btnPrimaryText}>{t('registration_close_yes')}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  card: { width: '100%', maxWidth: 420, backgroundColor: brand.bg, borderRadius: radius.lg, padding: 20 },
  title: { ...typography.h1, fontSize: 20, lineHeight: 26, color: brand.textPrimary, marginBottom: 8 },
  text: { ...typography.body, color: brand.textSecondary, marginBottom: 12 },
  saving: { ...typography.bodySmall, color: brand.textSecondary, marginBottom: 8 },
  failed: { ...typography.bodySmall, color: brand.error || '#EF4444', marginBottom: 8 },
  row: { flexDirection: 'row', gap: 10, marginTop: 6 },
  btn: { flex: 1, height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { borderWidth: 1, borderColor: brand.border, backgroundColor: brand.surface },
  btnGhostText: { ...typography.button, color: brand.textPrimary },
  btnPrimary: { backgroundColor: brand.primary },
  btnPrimaryText: { ...typography.button, color: brand.textOnPrimary },
});
