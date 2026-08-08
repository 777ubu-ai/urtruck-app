// ConsentRow — compact legal-consent block used on every screen
// where the user is about to receive an OTP or finish registration.
//
// Stage 24: shape on purpose — single-line checkbox + tiny links
// to /terms and /privacy. The full legal text lives on the linked
// pages; the welcome surface stays calm. Re-used by AuthScreen,
// RegScreen and any future signup flow so the wording stays
// identical and there is exactly one place to change versions.
//
// Stage 36: переписан на Pressable. Корни багов в проде на v85:
//   1. <Text onPress> для маленьких ссылок «Оферта»/«Конфиденциальность»
//      на react-native-web рендерится как <span onClick> без cursor:
//      pointer и без hitSlop — крохотный 11px target часто не ловит
//      tap, событие проваливается в родительский View.
//   2. <TouchableOpacity> с дочерним <Text style={{flex:1}}> в
//      react-native-web передаёт touch events ребёнку (selectable text),
//      из-за чего родительский onPress на checkbox row НЕ срабатывает.
//      Пользователь видел галочку, но `checked` state оставался false.
//
// Решение:
//   - checkbox row → Pressable + pointerEvents="none" на text
//   - terms/privacy → отдельные Pressable с hitSlop, accessibilityRole="link"
//   - двойной fallback на open: window.open + Linking.openURL

import React from 'react';
import { View, Text, Pressable, Linking, StyleSheet, Platform } from 'react-native';
import { useV1Colors } from '../theme/designV1';
import { useI18n } from '../utils/useI18n';
import { WEB_URL } from '../config/env';

const TERMS_URL = `${WEB_URL || 'https://urtruck.kz'}/terms`;
const PRIVACY_URL = `${WEB_URL || 'https://urtruck.kz'}/privacy`;

const openLegal = (url) => {
  // Stage 36: гарантированный double fallback. На web — window.open в
  // новой вкладке. Если popup blocker сработал и window.open вернул
  // null, валимся на Linking.openURL (RN-web проксирует на location.href).
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const win = window.open(url, '_blank', 'noopener,noreferrer');
      if (win) return;
    } catch (e) {
      if (typeof console !== 'undefined') console.warn('[ConsentRow] window.open failed:', e?.message || e);
    }
  }
  try {
    Linking.openURL(url).catch((e) => {
      if (typeof console !== 'undefined') console.warn('[ConsentRow] Linking.openURL rejected:', e?.message || e);
    });
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[ConsentRow] Linking.openURL threw:', e?.message || e);
  }
};

export default function ConsentRow({ checked, onChange, accent, testID = 'consent-row' }) {
  const v1 = useV1Colors();
  const { t } = useI18n();
  const tone = accent || v1.driver || '#168A5B';

  return (
    <View style={s.wrap} testID={testID}>
      <Pressable
        onPress={() => onChange(!checked)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: !!checked }}
        accessibilityLabel={t('registration_consent_text')}
        style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}
        testID={`${testID}-toggle`}
        hitSlop={6}
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
        {/* pointerEvents="none" на тексте — без него на react-native-web
            <Text> перехватывает touch event и Pressable родителя не
            получает onPress. Это и было причиной "галочка нарисована,
            но consent=false" в проде на v85. */}
        <Text
          style={[s.text, { color: v1.textMuted }]}
          numberOfLines={3}
          pointerEvents="none"
        >
          {t('registration_consent_text')}
        </Text>
      </Pressable>

      <View style={s.linksRow}>
        <Pressable
          onPress={() => openLegal(TERMS_URL)}
          accessibilityRole="link"
          accessibilityLabel={t('terms_link')}
          hitSlop={12}
          style={({ pressed }) => [s.linkBtn, pressed && { opacity: 0.6 }]}
          testID={`${testID}-terms`}
        >
          <Text style={[s.link, { color: v1.textDim }]}>{t('terms_link')}</Text>
        </Pressable>
        <Text style={[s.linkSep, { color: v1.textDim }]} pointerEvents="none">·</Text>
        <Pressable
          onPress={() => openLegal(PRIVACY_URL)}
          accessibilityRole="link"
          accessibilityLabel={t('privacy_link')}
          hitSlop={12}
          style={({ pressed }) => [s.linkBtn, pressed && { opacity: 0.6 }]}
          testID={`${testID}-privacy`}
        >
          <Text style={[s.link, { color: v1.textDim }]}>{t('privacy_link')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: 10, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 6 },
  box: {
    width: 20, height: 20, borderRadius: 5, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  tick: { color: '#0A0A0A', fontSize: 13, fontWeight: '900', lineHeight: 14 },
  text: { flex: 1, fontSize: 11, lineHeight: 15 },
  linksRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4, marginTop: 6 },
  linkBtn: { paddingVertical: 6, paddingHorizontal: 8 },
  link: { fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' },
  linkSep: { fontSize: 12, marginHorizontal: 2 },
});
