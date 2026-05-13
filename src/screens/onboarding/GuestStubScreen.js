// GuestStubScreen — заглушка для гостя на защищённых табах.
//
// Открывается когда юзер в guest mode пытается зайти на таб MyWork /
// Chats / Profile или нажать "Откликнуться" на CargoDetail. Показывает
// причину и одну CTA → PhoneV2 (или OnboardingV2, если стек чище).
//
// Использование (в защищённых табах батча 3 / RC2-A):
//   navigation.navigate('GuestStub', { reason: 'mywork' | 'chats' | ... })

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useI18n } from '../../utils/useI18n';
import { brand, radius, typography } from '../../theme/brandV2';

export default function GuestStubScreen({ navigation, route }) {
  const { t } = useI18n();
  const reason = route?.params?.reason || 'generic';

  const subtitleKey =
    reason === 'mywork' ? 'guest_stub_reason_mywork' :
    reason === 'chats' ? 'guest_stub_reason_chats' :
    reason === 'profile' ? 'guest_stub_reason_profile' :
    reason === 'response' ? 'guest_stub_reason_response' :
    'guest_stub_reason_generic';

  const onLogin = () => {
    // Если PhoneV2 уже в стеке (мы в unauthenticated flow) — просто push.
    // Если нет (мы в Main как гость) — navigate('PhoneV2') и стек растёт
    // как новая ветка регистрации поверх Main.
    try {
      navigation.navigate('PhoneV2');
    } catch {
      // Fallback на старый поток
      navigation.navigate('Auth');
    }
  };

  const onBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']} testID="guest-stub-screen">
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} testID="guest-stub-back">
          <Feather name="arrow-left" size={22} color={brand.textPrimary} />
        </TouchableOpacity>
      </View>

      <View style={s.content}>
        <View style={s.iconCircle}>
          <Feather name="lock" size={36} color={brand.primary} />
        </View>

        <Text style={s.title}>{t('guest_stub_title')}</Text>
        <Text style={s.subtitle}>{t(subtitleKey)}</Text>

        <View style={s.benefitsList}>
          {[
            { icon: 'message-circle', text: t('guest_stub_benefit_chat') },
            { icon: 'package', text: t('guest_stub_benefit_publish') },
            { icon: 'star', text: t('guest_stub_benefit_rating') },
          ].map((b) => (
            <View key={b.icon} style={s.benefitRow}>
              <View style={s.benefitIconWrap}>
                <Feather name={b.icon} size={16} color={brand.primary} />
              </View>
              <Text style={s.benefitText}>{b.text}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={s.ctaWrap}>
        <TouchableOpacity
          onPress={onLogin}
          activeOpacity={0.9}
          accessibilityRole="button"
          testID="guest-stub-login"
          style={[s.ctaPrimary, { backgroundColor: brand.primary }]}
        >
          <Text style={s.ctaPrimaryText}>{t('guest_stub_cta')}</Text>
          <Feather name="arrow-right" size={20} color="#FFF" />
        </TouchableOpacity>
        <Text style={s.hint}>{t('guest_stub_hint')}</Text>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: brand.bg },
  header: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: brand.primarySoft,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    ...typography.h1,
    color: brand.textPrimary,
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    ...typography.body,
    color: brand.textSecondary,
    textAlign: 'center',
    marginBottom: 28,
  },
  benefitsList: {
    width: '100%',
    gap: 12,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  benefitIconWrap: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: brand.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  benefitText: {
    flex: 1,
    ...typography.body,
    color: brand.textPrimary,
    fontWeight: '600',
  },
  ctaWrap: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  ctaPrimary: {
    height: 56,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  ctaPrimaryText: {
    ...typography.button,
    color: brand.textOnPrimary,
    flex: 1,
    textAlign: 'center',
  },
  hint: {
    ...typography.caption,
    color: brand.textTertiary,
    textAlign: 'center',
    marginTop: 12,
  },
});
