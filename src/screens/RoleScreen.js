// RoleScreen — welcome / role selection (light B2B style).
//
// RC2 fix (14 May):
//   Старый dark hero-truck экран заменён на light B2B layout по
//   designSystemV2 / brandV2. Без emoji, outline Feather icons,
//   белый surface, navy text, accent orange для логотипа.
//
//   Бизнес-логика сохранена 1-в-1:
//     - enterAs(role) → navigate('Reg', { role }) для нового юзера,
//       или setRole + reset Main если уже залогинен
//     - goAuth → navigate('Login')
//     - browseAsGuest → ensureGuest + navigate Main (role='driver', guest)
//
//   PNG role-screen-hero.png больше не используется. Файл оставлен
//   в assets/ как legacy (на случай rollback), но импорта нет.

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useI18n } from '../utils/useI18n';
import { useAuth } from '../utils/AuthContext';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { brand, useBrand, radius, typography } from '../theme/brandV2';

export default function RoleScreen({ navigation }) {
  const localBrand = useBrand();
  const styles = useMemo(() => makeStyles(localBrand), [localBrand]);
  const { t } = useI18n();
  const { setRole, session, ensureGuest } = useAuth();

  // Локальная (была module-scope): нужен доступ к живым styles/localBrand,
  // чтобы карточка реагировала на смену темы (P1 light/dark fix).
  const RoleCard = ({
    icon,
    iconColor,
    title,
    description,
    onPress,
    disabled,
    testID,
  }) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [
        styles.card,
        pressed && { opacity: 0.85 },
        disabled && { opacity: 0.5 },
      ]}
    >
      <View style={[styles.cardIcon, { backgroundColor: localBrand.surfaceMuted }]}>
        <Feather name={icon} size={26} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardDesc} numberOfLines={3}>
          {description}
        </Text>
      </View>
      <Feather name="chevron-right" size={20} color={localBrand.textTertiary} />
    </Pressable>
  );
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  const browseAsGuest = async () => {
    if (busy) return;
    try {
      setBusy('guest');
      await ensureGuest();
      // Гость = грузовладелец (client) по умолчанию: оранжевый бренд +
      // лента «Машины». Роль сменится на реальную после входа.
      navigation.navigate('Main', { role: 'client', guest: true });
    } catch (e) {
      setError(t('connection_failed'));
    } finally {
      setBusy(null);
    }
  };

  const enterAs = async (role) => {
    if (busy) return;
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.warn(`[RoleScreen] role-${role} pressed`);
    }
    try {
      if (session && session.user && session.user.id) {
        setBusy(role);
        setRole(role);
        navigation.reset({ index: 0, routes: [{ name: 'Main', params: { role } }] });
        return;
      }
      // RC2: предпочитаем новый PhoneV2 flow. Legacy 'Reg' остался
      // на случай если PhoneV2 не доступен в стеке (qaPreview etc).
      try {
        navigation.navigate('PhoneV2', { role });
      } catch {
        navigation.navigate('Reg', { role });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[RoleScreen] enterAs failed:', e?.message || e);
      setError(t('connection_failed'));
      setBusy(null);
    }
  };

  const goAuth = () => {
    try {
      try {
        navigation.navigate('PhoneV2');
      } catch {
        navigation.navigate('Login');
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[RoleScreen] navigate Auth failed:', e?.message || e);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.outer}>
        <View style={styles.column} testID="role-screen-column">
          <View style={styles.topBar} pointerEvents="box-none">
            <View style={{ width: 1 }} />
            <LanguageSwitcher testID="role-lang-switch" />
          </View>

          {/* Logo + tagline */}
          <View style={styles.brandBlock}>
            <Text style={styles.logo}>
              <Text style={{ color: brand.logoDark }}>Ur</Text>
              <Text style={{ color: brand.logoAccent }}>Truck</Text>
            </Text>
            <Text style={styles.tagline}>{t('role_welcome_tagline')}</Text>
          </View>

          {/* Role cards */}
          <View style={styles.cardsBlock}>
            {/* Card 1 — Перевезти груз (client / cargo owner) */}
            <RoleCard
              icon="package"
              iconColor={brand.accent}
              title={t('role_client_title')}
              description={t('role_client_desc')}
              onPress={() => enterAs('client')}
              disabled={!!busy}
              testID="role-client"
            />
            {/* Card 2 — Брать грузы (driver / carrier) */}
            <RoleCard
              icon="truck"
              iconColor={brand.primary}
              title={t('role_driver_title')}
              description={t('role_driver_desc')}
              onPress={() => enterAs('driver')}
              disabled={!!busy}
              testID="role-driver"
            />
          </View>

          {/* Already have an account → login */}
          <Pressable
            onPress={goAuth}
            testID="role-login"
            accessibilityRole="button"
            accessibilityLabel={t('login_action')}
            style={({ pressed }) => [styles.loginLink, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.loginText}>
              {t('already_have_account')}{' '}
              <Text style={styles.loginCta}>{t('login_action')}</Text>
            </Text>
          </Pressable>

          {/* Browse as guest — secondary */}
          <TouchableOpacity
            onPress={browseAsGuest}
            disabled={!!busy}
            testID="role-browse-guest"
            accessibilityRole="button"
            accessibilityLabel={t('browse_as_guest')}
            activeOpacity={0.7}
            style={styles.guestBtn}
          >
            <Feather name="eye" size={16} color={brand.textSecondary} />
            <Text style={styles.guestBtnText}>{t('browse_as_guest')}</Text>
          </TouchableOpacity>

          {error ? (
            <View pointerEvents="none" style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (brand) => StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: brand.surfaceMuted,  // #F4F6FA
  },
  outer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  column: {
    flex: 1,
    width: '100%',
    maxWidth: 480,
    paddingHorizontal: 20,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 8,
  },
  brandBlock: {
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 28,
  },
  logo: {
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  tagline: {
    ...typography.body,
    color: brand.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 16,
  },
  cardsBlock: {
    gap: 12,
    marginBottom: 24,
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
  cardIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
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
  loginLink: {
    alignSelf: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },
  loginText: {
    ...typography.body,
    color: brand.textSecondary,
  },
  loginCta: {
    color: brand.primary,
    fontWeight: '700',
  },
  guestBtn: {
    flexDirection: 'row',
    alignSelf: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 8,
    marginBottom: 16,
  },
  guestBtnText: {
    ...typography.bodySmall,
    color: brand.textSecondary,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  errorBox: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: brand.error,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  errorText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
});
