// VerificationReferralCodeScreen — реферальный код агента (опционально).
//
// Не блокирует submit. Никакого backend endpoint'а на текущий момент
// нет (BACKEND GAP — см. PR description). Frontend хранит код только
// локально через storage; backend проигнорирует. Когда появится
// `/register/referral` или поле `referral_code` в `/register/vehicle`,
// заменить onSave на реальный API-вызов.
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import VerificationStepLayout from '../../components/verification/VerificationStepLayout';
import InstructionBulletList from '../../components/verification/InstructionBulletList';
import { useI18n } from '../../utils/useI18n';
import { useTheme } from '../../utils/ThemeContext';
import { useV1Colors } from '../../theme/designV1';
import { useToast } from '../../components/Toast';
import { storage } from '../../utils/storage';
import { TouchableOpacity } from 'react-native';

const STORAGE_KEY = 'ur_verification_referral_code';

export default function VerificationReferralCodeScreen({ navigation }) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const v1 = useV1Colors();
  const { toast } = useToast();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    storage.get(STORAGE_KEY).then((v) => v && setCode(v)).catch(() => {});
  }, []);

  const onSave = async () => {
    setBusy(true);
    try {
      const trimmed = (code || '').trim();
      if (trimmed) {
        await storage.set(STORAGE_KEY, trimmed);
        toast('✓ ' + t('verification_referral_saved'), 'success');
      } else {
        await storage.remove(STORAGE_KEY);
      }
      navigation.goBack();
    } catch {
      toast(t('no_connection'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const onSkip = () => navigation.goBack();

  return (
    <VerificationStepLayout
      title={t('verification_item_referralCode_title')}
      subtitle={t('verification_referral_subtitle_long')}
      onBack={() => navigation.goBack()}
      onClose={() => navigation.popToTop()}
      testID="verification-referral-screen"
      footer={
        <View style={{ gap: 10 }}>
          <TouchableOpacity
            onPress={onSave}
            disabled={busy}
            activeOpacity={0.85}
            style={[s.primary, { backgroundColor: '#00A86B', opacity: busy ? 0.5 : 1 }]}
            testID="verification-referral-save"
          >
            <Text style={s.primaryText}>{t('verification_referral_save')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onSkip}
            disabled={busy}
            activeOpacity={0.85}
            style={[s.secondary, { borderColor: v1.border, backgroundColor: theme.card }]}
            testID="verification-referral-skip"
          >
            <Text style={[s.secondaryText, { color: theme.text }]}>{t('verification_referral_skip')}</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <InstructionBulletList items={[
        t('verification_referral_bullet_1'),
        t('verification_referral_bullet_2'),
      ]} />
      <View style={{ marginTop: 20 }}>
        <Text style={[s.label, { color: v1.textMuted }]}>{t('verification_referral_field_label')}</Text>
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder={t('verification_referral_field_placeholder')}
          placeholderTextColor={v1.textMuted}
          autoCapitalize="characters"
          autoCorrect={false}
          style={[s.input, { backgroundColor: theme.card, borderColor: v1.border, color: theme.text }]}
          testID="verification-referral-input"
        />
      </View>
    </VerificationStepLayout>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '700', marginBottom: 8 },
  input: {
    height: 52, borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 14, fontSize: 14,
  },
  primary: { height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  secondary: { height: 50, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 14, fontWeight: '700' },
});
