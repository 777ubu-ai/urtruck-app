// ExampleImageCard — карточка «вот так надо / вот так нельзя».
//
// Behavior:
//   - source: ImageSource | null (если null — placeholder card)
//   - kind: 'good' | 'bad' — определяет угол: зелёный/красный border
//
// Если в registry статический require() ещё не открыт (фолбэк null),
// рендерим аккуратный neutral placeholder — НИКАКОГО fake screenshot'а.
import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { useV1Colors } from '../../theme/designV1';
import { useTheme } from '../../utils/ThemeContext';
import { useI18n } from '../../utils/useI18n';

const TONE = {
  good: { color: '#16A34A', icon: '✓' },
  bad:  { color: '#DC2626', icon: '✕' },
};

export default function ExampleImageCard({ source, kind = 'good', caption, testID }) {
  const v1 = useV1Colors();
  const { theme } = useTheme();
  const { t } = useI18n();
  const tone = TONE[kind] || TONE.good;
  return (
    <View style={[s.card, {
      backgroundColor: theme.card,
      borderColor: tone.color + '40',
    }]} testID={testID}>
      <View style={[s.imageWrap, { backgroundColor: v1.bgDeep, borderColor: v1.border }]}>
        {source ? (
          <Image source={source} style={s.image} resizeMode="cover" />
        ) : (
          <View style={s.placeholder}>
            <Text style={[s.placeholderIcon, { color: v1.textMuted }]}>🖼</Text>
            <Text style={[s.placeholderText, { color: v1.textMuted }]}>
              {t('verification_example_placeholder')}
            </Text>
          </View>
        )}
      </View>
      <View style={[s.captionRow, { borderTopColor: v1.border }]}>
        <View style={[s.dot, { backgroundColor: tone.color }]}>
          <Text style={s.dotIcon}>{tone.icon}</Text>
        </View>
        <Text style={[s.caption, { color: theme.text }]} numberOfLines={2}>
          {caption || (kind === 'good' ? t('verification_example_good') : t('verification_example_bad'))}
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
    flex: 1,
  },
  imageWrap: {
    aspectRatio: 1,
    borderBottomWidth: 1,
  },
  image: { width: '100%', height: '100%' },
  placeholder: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 12,
  },
  placeholderIcon: { fontSize: 32 },
  placeholderText: { fontSize: 11, marginTop: 6, textAlign: 'center' },
  captionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
    borderTopWidth: 1,
  },
  dot: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  dotIcon: { color: '#FFF', fontSize: 11, fontWeight: '900', lineHeight: 13 },
  caption: { fontSize: 11, fontWeight: '600', flex: 1, lineHeight: 14 },
});
