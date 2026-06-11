// GoodBadExampleSection — секция с двумя группами примеров «Так — да» / «Так — нет».
//
// На вход берёт ключи из ASSET_GROUPS и автоматически вытаскивает
// `source` через getVerificationAsset. Если асет ещё не в репо —
// ExampleImageCard сам отрисует neutral placeholder, без crash.
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import ExampleImageCard from './ExampleImageCard';
import { getVerificationAsset } from '../../assets/onboarding/verification';
import { useV1Colors } from '../../theme/designV1';
import { useTheme } from '../../utils/ThemeContext';
import { useI18n } from '../../utils/useI18n';

export default function GoodBadExampleSection({ group }) {
  const v1 = useV1Colors();
  const { theme } = useTheme();
  const { t } = useI18n();
  if (!group) return null;
  const good = (group.good || []).map(getVerificationAsset);
  const bad = (group.bad || []).map(getVerificationAsset);
  return (
    <View style={s.wrap}>
      {good.length > 0 ? (
        <>
          <Text style={[s.sectionLabel, { color: theme.text }]}>
            ✓ {t('verification_examples_good')}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
            {good.map((src, idx) => (
              <View key={`g-${idx}`} style={s.tile}>
                <ExampleImageCard source={src} kind="good" testID={`example-good-${idx}`} />
              </View>
            ))}
          </ScrollView>
        </>
      ) : null}
      {bad.length > 0 ? (
        <>
          <Text style={[s.sectionLabel, { color: theme.text, marginTop: 16 }]}>
            ✕ {t('verification_examples_bad')}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
            {bad.map((src, idx) => (
              <View key={`b-${idx}`} style={s.tile}>
                <ExampleImageCard source={src} kind="bad" testID={`example-bad-${idx}`} />
              </View>
            ))}
          </ScrollView>
        </>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: 20 },
  sectionLabel: { fontSize: 13, fontWeight: '800', marginBottom: 10 },
  row: { gap: 10, paddingRight: 8 },
  tile: { width: 140 },
});
