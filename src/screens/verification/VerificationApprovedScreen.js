// VerificationApprovedScreen — «Поздравляем, вы одобрены».
//
// После approve можно сразу публиковать рейсы и принимать заказы.
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../../utils/useI18n';
import { useTheme } from '../../utils/ThemeContext';
import { useV1Colors } from '../../theme/designV1';
import { getVerificationAsset } from '../../assets/onboarding/verification';

export default function VerificationApprovedScreen({ navigation }) {
  const v1 = useV1Colors();
  const { theme } = useTheme();
  const { t } = useI18n();
  const illustration = getVerificationAsset('success/success_illustration');

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.bg }]} edges={['top', 'bottom']} testID="verification-approved-screen">
      <View style={s.body}>
        <View style={[s.iconWrap, { backgroundColor: '#16A34A' + '14', borderColor: '#16A34A' + '40' }]}>
          {illustration ? (
            <Image source={illustration} style={s.illustration} resizeMode="contain" />
          ) : (
            <Text style={s.fallbackIcon}>✅</Text>
          )}
        </View>
        <Text style={[s.title, { color: theme.text }]}>
          {t('verification_approved_title')}
        </Text>
        <Text style={[s.body_text, { color: v1.textMuted }]}>
          {t('verification_approved_body')}
        </Text>
      </View>
      <View style={s.footer}>
        <TouchableOpacity
          onPress={() => { try { navigation.popToTop(); } catch { navigation.goBack(); } }}
          style={[s.primary, { backgroundColor: '#16A34A' }]}
          testID="verification-approved-done-btn"
        >
          <Text style={s.primaryText}>{t('verification_approved_ok_btn')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  iconWrap: {
    width: 160, height: 160, borderRadius: 80,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, marginBottom: 28,
  },
  illustration: { width: '70%', height: '70%' },
  fallbackIcon: { fontSize: 64 },
  title: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5, textAlign: 'center', marginBottom: 12 },
  body_text: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
  footer: { paddingHorizontal: 20, paddingBottom: 16, paddingTop: 12 },
  primary: { height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
});
