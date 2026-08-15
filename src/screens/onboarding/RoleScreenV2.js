// RoleScreenV2 — light-style post-OTP role selection (RC2 auth-flow).
//
// Reference: docs/design/rc2-auth-flow/03-role-select-light-reference.png
//   Title "Кто вы?" (h1 navy)
//   "Выберите роль, чтобы продолжить регистрацию" — subtitle slate
//   Card 1: "Водитель / Ищу грузы и маршруты" (с truck-icon-tile)
//     selected = green border + green check-circle справа
//     unselected = grey outline + empty circle справа
//   Card 2: "Грузовладелец / Ищу перевозчика для груза" (с box-icon-tile)
//   Green CTA "Продолжить" — disabled пока ничего не выбрано
//
// Бизнес-логика: setRole(role) → navigate ProfileV2

import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useI18n } from '../../utils/useI18n';
import { useAuth } from '../../utils/AuthContext';
import { regAPI } from '../../utils/registration';
import { brand, useBrand, radius, typography } from '../../theme/brandV2';

const RoleCard = ({
  s,
  icon, iconColor, title, description, selected, onPress, testID,
}) => (
  <Pressable
    onPress={onPress}
    testID={testID}
    accessibilityRole="button"
    accessibilityLabel={title}
    style={({ pressed }) => [
      s.card,
      selected && s.cardSelected,
      pressed && { opacity: 0.92 },
    ]}
  >
    <View
      style={[
        s.cardIconWrap,
        selected ? { backgroundColor: brand.primarySoft } : { backgroundColor: brand.surfaceMuted },
      ]}
    >
      <Feather name={icon} size={28} color={selected ? brand.primary : iconColor} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={s.cardTitle}>{title}</Text>
      <Text style={s.cardDesc} numberOfLines={2}>{description}</Text>
    </View>
    <View style={[s.indicator, selected && s.indicatorOn]}>
      {selected ? <Feather name="check" size={14} color="#FFF" /> : null}
    </View>
  </Pressable>
);

export default function RoleScreenV2({ navigation, route }) {
  const _b = useBrand();
  const s = React.useMemo(() => makeStyles(_b), [_b]);
  const { t } = useI18n();
  const { setRole } = useAuth();
  const phone = route?.params?.phone;
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const onContinue = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await regAPI.selectRole(selected);
      if (!result.ok && selected === 'driver' && result.error === 'phone_verification_required') {
        navigation.navigate('PhoneV2', {
          purpose: 'driver_phone',
          role: 'driver',
          resumeScreen: 'ProfileV2',
        });
        return;
      }
      if (!result.ok) {
        setError(t('role_v2_save_failed'));
        return;
      }
      setRole(result.role);
      navigation.navigate('ProfileV2', { phone, role: result.role });
    } catch {
      setError(t('role_v2_save_failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']} testID="role-v2-screen">
      <View style={s.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          testID="role-v2-back"
        >
          <Feather name="arrow-left" size={22} color={brand.textPrimary} />
        </Pressable>
      </View>

      <View style={s.content}>
        <Text style={s.title}>{t('role_v2_title')}</Text>
        <Text style={s.subtitle}>{t('role_v2_subtitle')}</Text>

        <View style={s.cardsCol}>
          <RoleCard
            s={s}
            icon="truck"
            iconColor={brand.textPrimary}
            title={t('role_v2_driver')}
            description={t('role_v2_driver_desc')}
            selected={selected === 'driver'}
            onPress={() => setSelected('driver')}
            testID="role-v2-driver"
          />
          <RoleCard
            s={s}
            icon="package"
            iconColor={brand.accent}
            title={t('role_v2_client')}
            description={t('role_v2_client_desc')}
            selected={selected === 'client'}
            onPress={() => setSelected('client')}
            testID="role-v2-client"
          />
        </View>
        {error ? <Text style={s.error}>{error}</Text> : null}
      </View>

      <View style={s.ctaWrap}>
        <Pressable
          onPress={onContinue}
          disabled={!selected || busy}
          accessibilityRole="button"
          testID="role-v2-cta"
          style={({ pressed }) => [
            s.ctaPrimary,
            { backgroundColor: selected ? brand.primary : brand.borderStrong },
            pressed && selected && { opacity: 0.85 },
          ]}
        >
          <Text style={s.ctaPrimaryText}>{t('role_v2_continue')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (brand) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: brand.bg },
  header: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 4,
  },
  backBtn: {
    width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 4,
  },
  title: {
    ...typography.h1,
    color: brand.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    ...typography.body,
    color: brand.textSecondary,
    marginBottom: 24,
  },
  error: { ...typography.bodySmall, color: brand.error, marginTop: 16 },
  cardsCol: {
    gap: 14,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: brand.surface,
    borderRadius: radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: brand.border,
    // лёгкая тень — мягкий border под shadow
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
    elevation: 1,
  },
  cardSelected: {
    borderColor: brand.primary,
    borderWidth: 2,
  },
  cardIconWrap: {
    width: 60, height: 60, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: {
    ...typography.bodyLarge,
    fontWeight: '800',
    color: brand.textPrimary,
    marginBottom: 2,
  },
  cardDesc: {
    ...typography.bodySmall,
    color: brand.textSecondary,
  },
  indicator: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 1.5,
    borderColor: brand.border,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: brand.surface,
  },
  indicatorOn: {
    backgroundColor: brand.primary,
    borderColor: brand.primary,
  },
  ctaWrap: {
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  ctaPrimary: {
    height: 56,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPrimaryText: {
    ...typography.button,
    color: brand.textOnPrimary,
  },
});
