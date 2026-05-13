// RoleScreenV2 — post-OTP выбор роли.
//
// Открывается ПОСЛЕ OTP (когда у юзера уже есть token, но backend
// не знает его роль — то есть либо это новый юзер, либо существующий
// без сохранённой роли). До OTP роль не сохраняем — phone — это
// identity, role — продукт.
//
// Две карточки на выбор:
//   • Я водитель   → ProfileDriverV2
//   • Я грузовладелец → ProfileClientV2
//
// Hint снизу: "Можно сменить позже в настройках" — снимает страх
// "выбрал неправильно".

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useI18n } from '../../utils/useI18n';
import { useAuth } from '../../utils/AuthContext';
import { brand, radius, typography } from '../../theme/brandV2';

const RoleCard = ({ icon, title, subtitle, selected, onPress, testID }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [
      s.card,
      selected && {
        borderColor: brand.primary,
        borderWidth: 2,
        backgroundColor: brand.primarySoft,
      },
      pressed && { opacity: 0.9 },
    ]}
    accessibilityRole="button"
    testID={testID}
  >
    <View
      style={[
        s.cardIconWrap,
        selected ? { backgroundColor: brand.primary } : { backgroundColor: brand.surfaceMuted },
      ]}
    >
      <Feather
        name={icon}
        size={28}
        color={selected ? '#FFF' : brand.textPrimary}
      />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={s.cardTitle}>{title}</Text>
      <Text style={s.cardSubtitle}>{subtitle}</Text>
    </View>
    <Feather
      name={selected ? 'check-circle' : 'chevron-right'}
      size={20}
      color={selected ? brand.primary : brand.textTertiary}
    />
  </Pressable>
);

export default function RoleScreenV2({ navigation, route }) {
  const { t } = useI18n();
  const { setRole } = useAuth();
  const phone = route?.params?.phone;
  const [selected, setSelected] = useState(null);

  const onContinue = () => {
    if (!selected) return;
    setRole(selected);
    const next = selected === 'driver' ? 'ProfileDriverV2' : 'ProfileClientV2';
    navigation.navigate(next, { phone });
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']} testID="role-v2-screen">
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Feather name="arrow-left" size={22} color={brand.textPrimary} />
        </TouchableOpacity>
      </View>

      <View style={s.content}>
        <Text style={s.logo}>
          <Text style={{ color: brand.logoDark }}>Ur</Text>
          <Text style={{ color: brand.logoAccent }}>Truck</Text>
        </Text>

        <Text style={s.title}>{t('role_v2_title')}</Text>
        <Text style={s.subtitle}>{t('role_v2_subtitle')}</Text>

        <View style={s.cardsCol}>
          <RoleCard
            icon="truck"
            title={t('role_v2_driver_card_title')}
            subtitle={t('role_v2_driver_card_subtitle')}
            selected={selected === 'driver'}
            onPress={() => setSelected('driver')}
            testID="role-v2-driver"
          />
          <RoleCard
            icon="package"
            title={t('role_v2_client_card_title')}
            subtitle={t('role_v2_client_card_subtitle')}
            selected={selected === 'client'}
            onPress={() => setSelected('client')}
            testID="role-v2-client"
          />
        </View>

        <Text style={s.hint}>{t('role_v2_change_later_hint')}</Text>
      </View>

      <View style={s.ctaWrap}>
        <TouchableOpacity
          onPress={onContinue}
          disabled={!selected}
          activeOpacity={0.9}
          accessibilityRole="button"
          testID="role-v2-cta"
          style={[
            s.ctaPrimary,
            { backgroundColor: selected ? brand.primary : brand.borderStrong },
          ]}
        >
          <Text style={s.ctaPrimaryText}>{t('role_v2_continue')}</Text>
          <Feather name="arrow-right" size={20} color="#FFF" />
        </TouchableOpacity>
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
    paddingHorizontal: 20,
  },
  logo: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 32,
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
    paddingHorizontal: 20,
  },
  cardsCol: {
    gap: 14,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: brand.surface,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: radius.lg,
    padding: 16,
  },
  cardIconWrap: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: {
    ...typography.bodyLarge,
    color: brand.textPrimary,
    fontWeight: '800',
    marginBottom: 2,
  },
  cardSubtitle: {
    ...typography.bodySmall,
    color: brand.textSecondary,
  },
  hint: {
    ...typography.bodySmall,
    color: brand.textTertiary,
    textAlign: 'center',
    marginTop: 18,
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
});
