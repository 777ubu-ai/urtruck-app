import React from 'react';
import Feather from '@expo/vector-icons/Feather';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useI18n } from '../utils/useI18n';
import { brandLight } from '../theme/brandV2';

export default function AuthAccountHint({ identifier, navigation, disabled = false, compact = false }) {
  const { t } = useI18n();
  const email = String(identifier || '').trim();
  if (!email.includes('@')) return null;
  return (
    <View style={[styles.container, compact && styles.compact]}>
      {compact ? <Feather name="mail" size={24} color={brandLight.primary} /> : null}
      <View style={compact && styles.copy}>
      <Text style={styles.label}>{t('auth_confirmed_email')}</Text>
      <Text style={styles.email} testID="auth-confirmed-email">{email}</Text>
      </View>
      {compact ? <Feather name="check-circle" size={22} color={brandLight.primary} /> : <Pressable
        accessibilityRole="button"
        testID="auth-existing-account"
        disabled={disabled}
        accessibilityState={{ disabled }}
        style={styles.button}
        onPress={() => {
          if (!disabled) navigation.reset({ index: 0, routes: [{ name: 'PhoneV2' }] });
        }}
      >
        <Text style={styles.link}>{t('auth_existing_account')}</Text>
      </Pressable>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 12 },
  compact: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: 56, borderRadius: 14, backgroundColor: '#E6F4EE', marginTop: 0, marginBottom: 24 },
  copy: { flex: 1, minWidth: 0 },
  label: { fontSize: 14, lineHeight: 20, color: brandLight.textSecondary },
  email: { fontSize: 16, lineHeight: 23, fontWeight: '600', color: brandLight.textPrimary },
  button: { minHeight: 44, justifyContent: 'center', paddingVertical: 8 },
  link: { fontSize: 14, lineHeight: 20, color: brandLight.primary, textDecorationLine: 'underline' },
});
