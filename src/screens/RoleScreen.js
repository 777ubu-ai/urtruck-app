import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import { useAuth, LEVELS } from '../utils/AuthContext';
import { useVerificationGate } from '../components/VerificationGate';

// HOT2-008: Dark Premium стиль (как в OnboardingScreen)
const DARK = {
  bg: '#0a0f1a',
  card: 'rgba(255,255,255,0.05)',
  cardBorder: 'rgba(255,255,255,0.1)',
  text: '#FFFFFF',
  textMuted: 'rgba(255,255,255,0.6)',
  accentBlue: '#378ADD',
  accentYellow: '#F59E0B',
  accentGreen: '#4CAF50',
};

export default function RoleScreen({ navigation }) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const { ensureGuest, hasToken } = useAuth();
  const { requireLevel, Gate } = useVerificationGate();

  const selectRole = async (role) => {
    const ok = await requireLevel(LEVELS.PHONE, role === 'driver' ? 'driver' : 'default');
    if (!ok) return;
    navigation.navigate('Reg', { role });
  };

  // HOT2-001: Быстрый просмотр — сразу в ленту как guest
  const quickPreview = async () => {
    try {
      if (!hasToken) await ensureGuest();
      navigation.reset({ index: 0, routes: [{ name: 'Main', params: { role: 'client' } }] });
    } catch (e) {
      console.warn('[Role] quick preview failed:', e);
    }
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: DARK.bg }]}>
      <View style={s.logoWrap}>
        <View style={s.logo}><Text style={{ fontSize: 28 }}>🚛</Text></View>
        <Text style={s.logoText}>UrTruck</Text>
      </View>

      <View style={s.content}>
        <Text style={s.heading}>{t('whoAreYou')}</Text>

        <TouchableOpacity
          style={[s.roleBtn, { borderColor: `${DARK.accentBlue}80` }]}
          onPress={() => selectRole('driver')}
          activeOpacity={0.85}
        >
          <View style={[s.roleIcon, { backgroundColor: DARK.accentBlue }]}>
            <Text style={{ fontSize: 26 }}>🚛</Text>
          </View>
          <View style={s.roleInfo}>
            <Text style={s.roleName}>{t('driver')}</Text>
            <Text style={s.roleDesc}>{t('driverDesc')}</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.roleBtn, { borderColor: `${DARK.accentYellow}80` }]}
          onPress={() => selectRole('client')}
          activeOpacity={0.85}
        >
          <View style={[s.roleIcon, { backgroundColor: DARK.accentYellow }]}>
            <Text style={{ fontSize: 26 }}>📦</Text>
          </View>
          <View style={s.roleInfo}>
            <Text style={s.roleName}>{t('client')}</Text>
            <Text style={s.roleDesc}>{t('clientDesc')}</Text>
          </View>
        </TouchableOpacity>

        {/* HOT2-001: третий вариант — гостевой режим */}
        <TouchableOpacity
          style={[s.roleBtn, { borderColor: `${DARK.accentGreen}80` }]}
          onPress={quickPreview}
          activeOpacity={0.85}
        >
          <View style={[s.roleIcon, { backgroundColor: DARK.accentGreen }]}>
            <Text style={{ fontSize: 26 }}>👀</Text>
          </View>
          <View style={s.roleInfo}>
            <Text style={s.roleName}>{t('quick_preview')}</Text>
            <Text style={s.roleDesc}>{t('quick_preview_sub')}</Text>
          </View>
        </TouchableOpacity>
      </View>
      {Gate}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  logoWrap: { alignItems: 'center', paddingTop: 40, marginBottom: 30 },
  logo: {
    width: 64, height: 64, borderRadius: 18,
    backgroundColor: DARK.accentBlue, alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  logoText: { fontSize: 26, fontWeight: '900', color: DARK.text, letterSpacing: -0.5 },
  content: { flex: 1, justifyContent: 'center' },
  heading: { fontSize: 24, fontWeight: '800', marginBottom: 22, color: DARK.text },
  roleBtn: {
    borderWidth: 1, borderRadius: 18,
    padding: 18, marginBottom: 12,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: DARK.card,
  },
  roleIcon: {
    width: 52, height: 52, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  roleInfo: { flex: 1 },
  roleName: { fontSize: 17, fontWeight: '800', color: DARK.text },
  roleDesc: { fontSize: 12, marginTop: 3, color: DARK.textMuted },
});
