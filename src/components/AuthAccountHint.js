import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useI18n } from '../utils/useI18n';
import { brandLight } from '../theme/brandV2';

export default function AuthAccountHint({ identifier, navigation, disabled = false }) {
  const { t } = useI18n();
  const email = String(identifier || '').trim();
  if (!email.includes('@')) return null;
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{t('auth_confirmed_email')}</Text>
      <Text style={styles.email} testID="auth-confirmed-email">{email}</Text>
      <Pressable
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
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 12 },
  label: { fontSize: 14, lineHeight: 20, color: brandLight.textSecondary },
  email: { fontSize: 16, lineHeight: 23, fontWeight: '600', color: brandLight.textPrimary },
  button: { minHeight: 44, justifyContent: 'center', paddingVertical: 8 },
  link: { fontSize: 14, lineHeight: 20, color: brandLight.primary, textDecorationLine: 'underline' },
});
