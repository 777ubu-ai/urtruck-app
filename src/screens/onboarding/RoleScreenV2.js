// RoleScreenV2 — шаг 1 из 2 после подтверждённой auth-identity.
// Канон: роль выбирается до заполнения обязательного контактного профиля.

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
import { useBrand, radius, typography } from '../../theme/brandV2';

function StepIndicator({ s, colors }) {
  return (
    <View style={s.stepWrap} testID="role-v2-step">
      <View style={[s.stepDot, s.stepDotActive]}>
        <Text style={s.stepDotActiveText}>1</Text>
      </View>
      <View style={s.stepLine} />
      <View style={s.stepDot}>
        <Text style={s.stepDotText}>2</Text>
      </View>
    </View>
  );
}

function RoleCard({
  s,
  colors,
  icon,
  title,
  description,
  selected,
  onPress,
  testID,
}) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        s.card,
        selected && s.cardSelected,
        pressed && s.cardPressed,
      ]}
    >
      <View style={[s.cardIconWrap, selected && s.cardIconWrapSelected]}>
        <Feather
          name={icon}
          size={30}
          color={selected ? colors.primary : colors.textSecondary}
        />
      </View>

      <View style={s.cardCopy}>
        <Text style={s.cardTitle}>{title}</Text>
        <Text style={s.cardDesc} numberOfLines={2}>{description}</Text>
      </View>

      <View style={[s.indicator, selected && s.indicatorOn]}>
        {selected ? <Feather name="check" size={15} color={colors.textOnPrimary} /> : null}
      </View>
    </Pressable>
  );
}

export default function RoleScreenV2({ navigation, route }) {
  const colors = useBrand();
  const s = React.useMemo(() => makeStyles(colors), [colors]);
  const { t } = useI18n();
  const { setRole } = useAuth();
  const signupIdentity = route?.params?.phone || '';
  const [selected, setSelected] = useState(null);

  const onContinue = () => {
    if (!selected) return;
    setRole(selected);
    navigation.navigate('ProfileV2', { phone: signupIdentity, role: selected });
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']} testID="role-v2-screen">
      <View style={s.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [s.backBtn, pressed && s.backBtnPressed]}
          accessibilityRole="button"
          testID="role-v2-back"
        >
          <Feather name="arrow-left" size={22} color={colors.textPrimary} />
        </Pressable>
      </View>

      <View style={s.content}>
        <StepIndicator s={s} colors={colors} />
        <Text style={s.stepCaption}>1 / 2</Text>

        <Text style={s.title}>{t('role_v2_title')}</Text>
        <Text style={s.subtitle}>{t('role_v2_subtitle')}</Text>

        <View style={s.cardsCol}>
          <RoleCard
            s={s}
            colors={colors}
            icon="package"
            title={t('role_v2_client')}
            description={t('role_v2_client_desc')}
            selected={selected === 'client'}
            onPress={() => setSelected('client')}
            testID="role-v2-client"
          />
          <RoleCard
            s={s}
            colors={colors}
            icon="truck"
            title={t('role_v2_driver')}
            description={t('role_v2_driver_desc')}
            selected={selected === 'driver'}
            onPress={() => setSelected('driver')}
            testID="role-v2-driver"
          />
        </View>
      </View>

      <View style={s.ctaWrap}>
        <Pressable
          onPress={onContinue}
          disabled={!selected}
          accessibilityRole="button"
          accessibilityState={{ disabled: !selected }}
          testID="role-v2-cta"
          style={({ pressed }) => [
            s.ctaPrimary,
            { backgroundColor: selected ? colors.primary : colors.borderStrong },
            pressed && selected && s.ctaPressed,
          ]}
        >
          <Text style={s.ctaPrimaryText}>{t('role_v2_continue')}</Text>
          <Feather name="arrow-right" size={20} color={colors.textOnPrimary} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 2,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnPressed: {
    opacity: 0.6,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 4,
  },
  stepWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  stepDotActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  stepDotText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  stepDotActiveText: {
    ...typography.caption,
    color: colors.textOnPrimary,
    fontWeight: '800',
  },
  stepLine: {
    width: 54,
    height: 2,
    marginHorizontal: 7,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  stepCaption: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 26,
  },
  title: {
    ...typography.h1,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 28,
  },
  cardsCol: {
    gap: 14,
  },
  card: {
    minHeight: 150,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    paddingHorizontal: 18,
    paddingVertical: 20,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 9,
    elevation: 2,
  },
  cardSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  cardPressed: {
    opacity: 0.92,
  },
  cardIconWrap: {
    width: 62,
    height: 62,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  cardIconWrapSelected: {
    backgroundColor: colors.primarySoft,
  },
  cardCopy: {
    flex: 1,
  },
  cardTitle: {
    ...typography.bodyLarge,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 5,
  },
  cardDesc: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  indicator: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  indicatorOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  ctaWrap: {
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 16,
  },
  ctaPrimary: {
    height: 58,
    borderRadius: radius.lg,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPressed: {
    opacity: 0.86,
  },
  ctaPrimaryText: {
    ...typography.button,
    color: colors.textOnPrimary,
  },
});
