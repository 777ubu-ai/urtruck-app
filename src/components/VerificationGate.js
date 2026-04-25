import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Easing,
  Modal, Pressable, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth, LEVELS } from '../utils/AuthContext';
import { useTheme } from '../utils/ThemeContext';
import { accentColors } from '../utils/theme';

const COPY = {
  default: {
    title: 'Нужна регистрация',
    body: 'Для полного доступа, просмотра контактов и размещения заявок, пожалуйста, пройдите регистрацию или авторизацию.',
  },
  contact: {
    title: 'Контакты под защитой',
    body: 'Просмотр контактов доступен только зарегистрированным пользователям. Это защищает водителей от спама.',
  },
  publish_cargo: {
    title: 'Публикация для своих',
    body: 'Чтобы разместить груз на платформе, нужно подтвердить личность. Пройдите регистрацию — это займёт 1 минуту.',
  },
  driver: {
    title: 'Стать перевозчиком',
    body: 'Для доступа к базе грузов и подачи заявок необходимо авторизоваться и пройти проверку документов.',
  },
  bid: {
    title: 'Подтверди личность',
    body: 'Чтобы предложить свою цену, нужна верификация. ИИН + селфи — 2 минуты, и ты в деле.',
  },
  open_detail: {
    title: 'Полные данные — для своих',
    body: 'Полная карточка груза с маршрутом, контактами и условиями доступна зарегистрированным пользователям.',
  },
};

function pickTarget(currentLevel, requiredLevel) {
  // Гость → сначала Auth (phone). Phone-юзер → Reg (identity/driver).
  if (currentLevel < 1) return 'Auth';
  return 'Reg';
}

export function useVerificationGate() {
  const { verificationLevel } = useAuth();
  const navigation = useNavigation();
  const [pending, setPending] = useState(null);

  const requireLevel = useCallback((required, action = 'default') => {
    return new Promise((resolve) => {
      if (verificationLevel >= required) resolve(true);
      else setPending({ required, action, resolve });
    });
  }, [verificationLevel]);

  const handleClose = useCallback(() => {
    if (!pending) return;
    pending.resolve(false);
    setPending(null);
  }, [pending]);

  const handleProceed = useCallback(() => {
    if (!pending) return;
    const { required, action, resolve } = pending;
    const target = pickTarget(verificationLevel, required);
    const isDriver = action === 'driver';
    setPending(null);
    resolve(false);
    // Защита — откладываем на следующий тик чтобы Modal успел закрыться
    setTimeout(() => {
      try {
        navigation.navigate(target, isDriver ? { role: 'driver' } : undefined);
      } catch (e) {
        console.warn('[Gate] navigate failed:', e);
      }
    }, 150);
  }, [pending, verificationLevel, navigation]);

  // Стабильный элемент — возвращается через useMemo
  const Gate = useMemo(() => (
    <VerificationGateSheet
      visible={!!pending}
      action={pending?.action || 'default'}
      currentLevel={verificationLevel}
      requiredLevel={pending?.required || 1}
      onClose={handleClose}
      onProceed={handleProceed}
    />
  ), [pending, verificationLevel, handleClose, handleProceed]);

  return { requireLevel, Gate };
}

export function VerificationGateSheet({ visible, action, currentLevel, requiredLevel, onClose, onProceed }) {
  const { theme, isDark } = useTheme();
  const slide = useRef(new Animated.Value(500)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const copy = COPY[action] || COPY.default;

  useEffect(() => {
    if (visible) {
      slide.setValue(500);
      opacity.setValue(0);
      Animated.parallel([
        Animated.timing(slide, { toValue: 0, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Animated.View style={[s.backdrop, { opacity, backgroundColor: theme.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View style={[
          s.sheet,
          { backgroundColor: theme.cardElevated, transform: [{ translateY: slide }] },
        ]}>
          <View style={[s.handle, { backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(15,23,42,0.15)' }]} />

          <View style={[s.lockBadge, { backgroundColor: `${accentColors.driver}15` }]}>
            <Text style={s.lockEmoji}>🔒</Text>
          </View>

          <Text style={[s.title, { color: theme.text }]}>{copy.title}</Text>
          <Text style={[s.body, { color: theme.textSecondary }]}>{copy.body}</Text>

          <View style={s.levels}>
            {[1, 2, 3].map(lvl => (
              <View key={lvl} style={[
                s.levelDot,
                {
                  backgroundColor: lvl <= currentLevel ? accentColors.browse :
                                    lvl === requiredLevel ? accentColors.driver :
                                    isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
                },
              ]}>
                {lvl <= currentLevel && <Text style={{ fontSize: 11, color: '#FFF' }}>✓</Text>}
              </View>
            ))}
          </View>

          <TouchableOpacity
            onPress={onProceed}
            style={[s.waBtn, Platform.OS === 'web' && {
              boxShadow: '0 10px 26px rgba(37, 211, 102, 0.4)',
            }]}
            activeOpacity={0.9}
          >
            <Text style={s.waEmoji}>💬</Text>
            <Text style={s.waText}>Войти через WhatsApp</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onProceed} style={s.altBtn}>
            <Text style={[s.altText, { color: accentColors.driver }]}>
              Другой способ (Telegram / SMS)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose} style={s.laterBtn} activeOpacity={0.7}>
            <Text style={[s.laterText, { color: theme.textMuted }]}>Не сейчас</Text>
          </TouchableOpacity>

          <View style={[s.trust, { backgroundColor: `${accentColors.browse}10` }]}>
            <Text style={[s.trustText, { color: theme.textMuted }]}>
              🛡 Данные зашифрованы · регистрация занимает 1 минуту
            </Text>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

export default function VerificationGate({ requires, children, fallback = null }) {
  const { verificationLevel } = useAuth();
  if (verificationLevel >= requires) return children;
  return fallback;
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1, justifyContent: 'flex-end',
    ...Platform.select({ web: { backdropFilter: 'blur(10px)' }, default: {} }),
  },
  sheet: {
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 36,
    alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.4, shadowOffset: { width: 0, height: -8 }, shadowRadius: 24,
  },
  handle: { width: 48, height: 5, borderRadius: 3, marginBottom: 16 },
  lockBadge: {
    width: 72, height: 72, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  lockEmoji: { fontSize: 36 },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 10, textAlign: 'center' },
  body: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 18, paddingHorizontal: 8 },
  levels: { flexDirection: 'row', gap: 12, marginBottom: 18 },
  levelDot: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  waBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    width: '100%', height: 56, borderRadius: 16, backgroundColor: '#25D366',
  },
  waEmoji: { fontSize: 22 },
  waText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  altBtn: { padding: 12, marginTop: 4 },
  altText: { fontSize: 14, fontWeight: '600' },
  laterBtn: { padding: 8 },
  laterText: { fontSize: 13, fontWeight: '500' },
  trust: { marginTop: 14, padding: 10, borderRadius: 10, width: '100%' },
  trustText: { fontSize: 11, textAlign: 'center' },
});
