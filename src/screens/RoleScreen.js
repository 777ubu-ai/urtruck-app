import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useI18n } from '../utils/useI18n';
import { useAuth } from '../utils/AuthContext';
import { regAPI } from '../utils/registration';
import AppShell from '../components/ui/AppShell';
import { colors, radius, spacing, typography } from '../theme/theme';

const buildRoles = (t) => [
  { key: 'driver', emoji: '🚛', color: colors.green,  bg: colors.greenMuted,  title: t('role_driver_title'), desc: t('role_driver_desc') },
  { key: 'client', emoji: '📦', color: colors.orange, bg: colors.orangeMuted, title: t('role_client_title'), desc: t('role_client_desc') },
];

const buildFeatures = (t) => [
  { icon: '🛡', label: t('role_feature_verified') },
  { icon: '🤝', label: t('role_feature_deals') },
  { icon: '💬', label: t('role_feature_chat') },
  { icon: '🌍', label: t('role_feature_routes') },
];

export default function RoleScreen({ navigation }) {
  const { t } = useI18n();
  const { signIn, setRole } = useAuth();
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState('');
  const ROLES = buildRoles(t);
  const FEATURES = buildFeatures(t);

  const enterAs = async (role) => {
    setLoading(role);
    setError('');
    try {
      const data = await regAPI.ensureGuest();
      if (!data?.token) { setError(t('server_unavailable')); setLoading(null); return; }
      await signIn('test-user', 1, data.token);
      setRole(role);
      navigation.reset({ index: 0, routes: [{ name: 'Main', params: { role } }] });
    } catch (e) {
      setError(t('connection_failed'));
      setLoading(null);
    }
  };

  return (
    <AppShell>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Hero — clean dark block, no heavy imagery */}
        <View style={s.hero}>
          <View style={s.brandRow}>
            <Text style={s.brand}>UrTruck</Text>
            <View style={s.brandBadge}><Text style={s.brandBadgeText}>FTL</Text></View>
          </View>
          <Text style={s.brandSub}>INTERNATIONAL LOGISTICS</Text>
          <Text style={s.headline}>{t('role_screen_headline')}</Text>
          <Text style={s.subline}>{t('role_screen_subline')}</Text>
        </View>

        {/* Trust strip — 4 benefits in one compact band */}
        <View style={s.trust}>
          {FEATURES.map((f, i) => (
            <View key={i} style={s.trustChip}>
              <Text style={s.trustIcon}>{f.icon}</Text>
              <Text style={s.trustLabel} numberOfLines={2}>{f.label}</Text>
            </View>
          ))}
        </View>

        {error ? <Text style={s.error}>{error}</Text> : null}

        {/* Role cards — primary CTA */}
        <View style={s.roleCol}>
          {ROLES.map((r) => (
            <TouchableOpacity
              key={r.key}
              style={[s.roleCard, { borderColor: r.color + '60' }]}
              onPress={() => enterAs(r.key)}
              disabled={!!loading}
              activeOpacity={0.85}
              testID={'role-' + r.key}
            >
              <View style={[s.roleIcon, { backgroundColor: r.bg }]}>
                {loading === r.key ? (
                  <ActivityIndicator color={r.color} size="small" />
                ) : (
                  <Text style={s.roleEmoji}>{r.emoji}</Text>
                )}
              </View>
              <View style={s.roleInfo}>
                <Text style={s.roleTitle}>{r.title}</Text>
                <Text style={s.roleDesc}>{r.desc}</Text>
              </View>
              <Text style={[s.arrow, { color: r.color }]}>&#8250;</Text>
            </TouchableOpacity>
          ))}
        </View>

      </ScrollView>
    </AppShell>
  );
}

const s = StyleSheet.create({
  scroll: { paddingBottom: 40 },

  // Hero — keep dark premium feel without a banner image
  hero: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.lg,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  brand: { ...typography.h1, color: colors.text, letterSpacing: -0.5 },
  brandBadge: {
    backgroundColor: colors.greenMuted,
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: radius.sm,
  },
  brandBadgeText: { color: colors.green, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  brandSub: { ...typography.small, color: colors.textDim, letterSpacing: 2.5, marginTop: 2 },
  headline: {
    ...typography.h2,
    color: colors.text,
    marginTop: spacing.lg,
    lineHeight: 28,
  },
  subline: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },

  error: {
    ...typography.caption,
    color: colors.red,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.sm,
  },

  // Trust band
  trust: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    rowGap: spacing.sm,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.lg,
  },
  trustChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    flexBasis: '48%',
    flexGrow: 1,
    minHeight: 36,
  },
  trustIcon: { fontSize: 14 },
  trustLabel: { ...typography.caption, color: colors.textSecondary, flexShrink: 1 },

  // Role cards
  roleCol: { paddingHorizontal: spacing.xl, gap: spacing.sm },
  roleCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  roleIcon: {
    width: 52, height: 52, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  roleEmoji: { fontSize: 26 },
  roleInfo: { flex: 1 },
  roleTitle: { ...typography.title, color: colors.text },
  roleDesc: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  arrow: { fontSize: 26, fontWeight: '300' },
});
