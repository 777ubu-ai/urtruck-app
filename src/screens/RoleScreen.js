import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useI18n } from '../utils/useI18n';
import { useAuth } from '../utils/AuthContext';
import { regAPI } from '../utils/registration';
import Screen from '../components/ui/v1/Screen';
import BrandHeader from '../components/ui/v1/BrandHeader';
import HeroTruck from '../components/ui/v1/HeroTruck';
import RoleCard from '../components/ui/v1/RoleCard';
import { v1Colors, v1Typography, v1Spacing } from '../theme/designV1';

// Welcome / role select — design v1, screen 01.
//
// Business logic preserved:
//   - regAPI.ensureGuest(): same backend call as before; we still mint a
//     guest session before navigating into the role-specific stack.
//   - signIn / setRole / navigation.reset target unchanged ('Main' route).
// Only the visual layer is rebuilt.

export default function RoleScreen({ navigation }) {
  const { t } = useI18n();
  const { signIn, setRole } = useAuth();
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState('');

  const enterAs = async (role) => {
    setLoading(role);
    setError('');
    try {
      const data = await regAPI.ensureGuest();
      if (!data?.token) { setError(t('server_unavailable')); setLoading(null); return; }
      await signIn('test-user', 1, data.token);
      setRole(role);
      navigation.reset({ index: 0, routes: [{ name: 'Main', params: { role } }] });
    } catch {
      setError(t('connection_failed'));
      setLoading(null);
    }
  };

  return (
    <Screen>
      <BrandHeader />
      <HeroTruck size="lg" />

      <Text style={s.headline}>{t('role_screen_headline')}</Text>
      <Text style={s.subline}>{t('role_screen_subline')}</Text>

      {error ? <Text style={s.error}>{error}</Text> : null}

      <View style={{ marginTop: v1Spacing.lg }}>
        <RoleCard
          role="driver"
          emoji="🚛"
          title={t('role_driver_title')}
          subtitle={t('role_driver_desc')}
          onPress={() => enterAs('driver')}
          loading={loading === 'driver'}
          testID="role-driver"
        />
        <RoleCard
          role="client"
          emoji="📦"
          title={t('role_client_title')}
          subtitle={t('role_client_desc')}
          onPress={() => enterAs('client')}
          loading={loading === 'client'}
          testID="role-client"
        />
      </View>

      <TouchableOpacity
        onPress={() => navigation.navigate('Auth')}
        style={s.alreadyRow}
        activeOpacity={0.7}
      >
        <Text style={s.alreadyText}>
          {t('already_have_account')}{' '}
          <Text style={s.alreadyLink}>{t('login_action')}</Text>
        </Text>
      </TouchableOpacity>
    </Screen>
  );
}

const s = StyleSheet.create({
  headline: {
    ...v1Typography.h1,
    textAlign: 'center',
    marginTop: v1Spacing.lg,
  },
  subline: {
    ...v1Typography.bodyMd,
    textAlign: 'center',
    marginTop: v1Spacing.xs,
  },
  error: {
    color: v1Colors.error,
    fontSize: 13,
    textAlign: 'center',
    marginTop: v1Spacing.sm,
  },
  alreadyRow: { alignItems: 'center', marginTop: v1Spacing.lg, paddingVertical: 6 },
  alreadyText: { color: v1Colors.textMuted, fontSize: 13 },
  alreadyLink: { color: v1Colors.driver, fontWeight: '700' },
});
