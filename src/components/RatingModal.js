import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, Modal, Pressable, TouchableOpacity, StyleSheet,
  TextInput, Animated, Easing, ActivityIndicator, Platform, KeyboardAvoidingView,
} from 'react-native';
import { useTheme } from '../utils/ThemeContext';
import { useToast } from './Toast';
import { useI18n } from '../utils/useI18n';
import { reviewsAPI } from '../utils/reviews';
import { v1AccentFor } from '../theme/designV1';

// Эмодзи-префикс остаётся здесь (иконка), текст берётся из i18n по ключу
// `rating_tag_${k}` в момент рендера.
const TAGS_BY_ROLE = {
  driver: [
    { k: 'punctual', icon: '⏱' },
    { k: 'clean', icon: '✨' },
    { k: 'polite', icon: '👍' },
    { k: 'careful', icon: '📦' },
    { k: 'fast', icon: '⚡' },
    { k: 'good_price', icon: '💰' },
  ],
  client: [
    { k: 'fast_pay', icon: '💰' },
    { k: 'honest', icon: '🤝' },
    { k: 'clear_docs', icon: '📄' },
    { k: 'reachable', icon: '📞' },
    { k: 'good_cargo', icon: '📦' },
  ],
};

export default function RatingModal({ visible, onClose, onSubmitted, targetId, targetRole, targetName, tripId }) {
  const { theme, isDark } = useTheme();
  const { toast } = useToast();
  const { t } = useI18n();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState('');
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(false);

  // Акцент по роли того, КТО ставит оценку: клиент оценивает водителя
  // (targetRole='driver') → оранжевый; водитель оценивает клиента → зелёный.
  const raterAccent = v1AccentFor(targetRole === 'driver' ? 'client' : 'driver');

  const slide = useRef(new Animated.Value(500)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      slide.setValue(500); opacity.setValue(0);
      setRating(0); setText(''); setTags([]); setHover(0);
      Animated.parallel([
        Animated.timing(slide, { toValue: 0, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const available = TAGS_BY_ROLE[targetRole] || TAGS_BY_ROLE.driver;

  const toggleTag = (k) => {
    setTags(prev => prev.includes(k) ? prev.filter(t => t !== k) : [...prev, k]);
  };

  const submit = async () => {
    if (rating === 0) { toast(t('rating_required'), 'error'); return; }
    setLoading(true);
    try {
      const r = await reviewsAPI.create({
        tripId, targetId, targetRole, rating, text: text.trim() || null, tags,
      });
      if (r.ok) {
        toast(`✓ ${t('rating_thanks')}`, 'success');
        onSubmitted?.(r);
        onClose?.();
      } else {
        toast(r.detail || t('send_error'), 'error');
      }
    } catch (e) {
      toast(t('network_error'), 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  const ratingLabels = ['', t('rating_label_1'), t('rating_label_2'), t('rating_label_3'), t('rating_label_4'), t('rating_label_5')];
  const ratingColor = rating >= 4 ? '#22C55E' : rating >= 3 ? '#F59E0B' : rating > 0 ? '#EF4444' : theme.textMuted;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      {/* P1: поле отзыва внизу bottom-sheet пряталось под клавиатурой — KAV поднимает */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Animated.View style={[s.backdrop, { opacity, backgroundColor: theme.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View style={[
          s.sheet,
          { backgroundColor: theme.cardElevated, transform: [{ translateY: slide }] },
        ]}>
          <View style={[s.handle, { backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(15,23,42,0.15)' }]} />

          <Text style={[s.title, { color: theme.text }]}>
            {t('rating_how_was_trip')}
          </Text>
          <Text style={[s.subtitle, { color: theme.textMuted }]}>
            {targetName
              ? t('rating_rate_target')
                  .replace('{role}', targetRole === 'driver' ? t('rating_role_driver') : t('rating_role_client'))
                  .replace('{name}', targetName)
              : t('rating_rate_partner')}
          </Text>

          {/* 5 звёзд */}
          <View style={s.starsRow}>
            {[1, 2, 3, 4, 5].map(n => (
              <Pressable
                key={n}
                onPress={() => setRating(n)}
                onHoverIn={() => Platform.OS === 'web' && setHover(n)}
                onHoverOut={() => Platform.OS === 'web' && setHover(0)}
                style={s.starBtn}
              >
                <Text style={[
                  s.star,
                  { opacity: (hover || rating) >= n ? 1 : 0.25 },
                ]}>⭐</Text>
              </Pressable>
            ))}
          </View>
          <Text style={[s.ratingLabel, { color: ratingColor }]}>
            {ratingLabels[hover || rating] || t('rating_choose_stars')}
          </Text>

          {/* Теги */}
          {rating > 0 && (
            <View style={s.tagsWrap}>
              {available.map(tag => {
                const active = tags.includes(tag.k);
                return (
                  <TouchableOpacity
                    key={tag.k}
                    style={[
                      s.tag,
                      {
                        backgroundColor: active ? raterAccent.main : theme.card,
                        borderColor: active ? raterAccent.main : theme.border,
                      },
                    ]}
                    onPress={() => toggleTag(tag.k)}
                  >
                    <Text style={[s.tagText, { color: active ? raterAccent.onAccent : theme.text }]}>{`${tag.icon} ${t('rating_tag_' + tag.k)}`}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Комментарий */}
          {rating > 0 && (
            <TextInput
              style={[s.textarea, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
              placeholder={t('rating_comment_optional')}
              placeholderTextColor={theme.textMuted}
              multiline
              value={text}
              onChangeText={setText}
              maxLength={500}
            />
          )}

          <TouchableOpacity
            style={[s.submit, { backgroundColor: rating > 0 ? raterAccent.main : theme.border }]}
            onPress={submit}
            disabled={rating === 0 || loading}
          >
            {loading ? <ActivityIndicator color={raterAccent.onAccent} /> : (
              <Text style={[s.submitText, rating > 0 && { color: raterAccent.onAccent }]}>{t('submit_review')}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose} style={s.skip}>
            <Text style={[s.skipText, { color: theme.textMuted }]}>{t('not_now')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 32,
  },
  handle: { width: 48, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 6 },
  subtitle: { fontSize: 13, textAlign: 'center', marginBottom: 22 },
  starsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  starBtn: { padding: 6 },
  star: { fontSize: 42 },
  ratingLabel: { fontSize: 14, fontWeight: '700', textAlign: 'center', marginTop: 8, marginBottom: 14, minHeight: 20 },
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  tag: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  tagText: { fontSize: 12, fontWeight: '600' },
  textarea: {
    borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 70,
    fontSize: 14, marginBottom: 14, textAlignVertical: 'top',
  },
  submit: { height: 54, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  skip: { padding: 12, alignItems: 'center', marginTop: 4 },
  skipText: { fontSize: 13 },
});
