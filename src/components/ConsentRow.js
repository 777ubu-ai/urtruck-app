// ConsentRow — compact legal-consent block used on every screen
// where the user is about to receive an OTP or finish registration.
//
// Stage 24: shape on purpose — single-line checkbox + tiny links
// to /terms and /privacy. The full legal text lives on the linked
// pages; the welcome surface stays calm. Re-used by AuthScreen,
// RegScreen and any future signup flow so the wording stays
// identical and there is exactly one place to change versions.

import React from 'react';
import { View, Text, TouchableOpacity, Linking, StyleSheet, Platform } from 'react-native';
import { useV1Colors } from '../theme/designV1';
import { useI18n } from '../utils/useI18n';
import { WEB_URL } from '../config/env';

const TERMS_URL = `${WEB_URL || 'https://urtruck.kz'}/terms`;
const PRIVACY_URL = `${WEB_URL || 'https://urtruck.kz'}/privacy`;

export default function ConsentRow({ checked, onChange, accent, testID = 'consent-row' }) {
  const v1 = useV1Colors();
  const { t } = useI18n();
  const tone = accent || v1.driver || '#22C55E';

  const open = (url) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      Linking.openURL(url).catch(() => {});
    }
  };

  return (
    <View style={s.wrap} testID={testID}>
      <TouchableOpacity
        onPress={() => onChange(!checked)}
        activeOpacity={0.7}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: !!checked }}
        accessibilityLabel={t('registration_consent_text')}
        style={s.row}
        testID={`${testID}-toggle`}
      >
        <View
          style={[
            s.box,
            {
              borderColor: checked ? tone : v1.border,
              backgroundColor: checked ? tone : 'transparent',
            },
          ]}
        >
          {checked ? <Text style={s.tick}>✓</Text> : null}
        </View>
        <Text style={[s.text, { color: v1.textMuted }]} numberOfLines={3}>
          {t('registration_consent_text')}
        </Text>
      </TouchableOpacity>

      <View style={s.linksRow}>
        <Text style={[s.link, { color: v1.textDim }]} onPress={() => open(TERMS_URL)} testID={`${testID}-terms`}>
          {t('terms_link')}
        </Text>
        <Text style={[s.linkSep, { color: v1.textDim }]}>·</Text>
        <Text style={[s.link, { color: v1.textDim }]} onPress={() => open(PRIVACY_URL)} testID={`${testID}-privacy`}>
          {t('privacy_link')}
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: 10, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 4 },
  box: {
    width: 18, height: 18, borderRadius: 4, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  tick: { color: '#0A0A0A', fontSize: 12, fontWeight: '900', lineHeight: 14 },
  text: { flex: 1, fontSize: 11, lineHeight: 15 },
  linksRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 6 },
  link: { fontSize: 11, fontWeight: '600', textDecorationLine: 'underline' },
  linkSep: { fontSize: 11 },
});
