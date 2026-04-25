import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
import { regAPI } from '../utils/registration';
import { useTheme } from '../utils/ThemeContext';
import { useAuth } from '../utils/AuthContext';

const CONFIG = {
  pending:        { color: '#F59E0B', emoji: '⏳', title: 'Документы на проверке', body: 'Ответ в течение часа. Можно пока смотреть ленту.' },
  under_review:   { color: '#F59E0B', emoji: '⏳', title: 'На автомодерации', body: 'Проверяем документы, это займёт до 2 минут.' },
  manual_review:  { color: '#F59E0B', emoji: '👨‍💼', title: 'Ручная проверка модератором', body: 'Ответ в течение часа. Мы отправим push-уведомление.' },
  approved:       { color: '#22C55E', emoji: '✅', title: 'Одобрено', body: 'Документы приняты. Можно работать!' },
  rejected:       { color: '#EF4444', emoji: '⛔', title: 'Отклонено', body: 'Проверьте причину в профиле и попробуйте снова.' },
};

export default function VerificationStatusBanner() {
  const { theme, isDark } = useTheme();
  const { verificationLevel, hasToken } = useAuth();
  const [status, setStatus] = useState(null);
  const [hidden, setHidden] = useState(false);
  const slide = useRef(new Animated.Value(-60)).current;

  useEffect(() => {
    if (!hasToken) return;
    let alive = true;
    const fetchStatus = async () => {
      try {
        const me = await regAPI.me();
        if (!alive || !me) return;
        setStatus(me.status);
      } catch {}
    };
    fetchStatus();
    // Пуллинг раз в 30 сек пока статус не approved
    const iv = setInterval(() => {
      if (status !== 'approved') fetchStatus();
    }, 30000);
    return () => { alive = false; clearInterval(iv); };
  }, [hasToken, status]);

  useEffect(() => {
    if (status && status !== 'approved' && !hidden) {
      Animated.timing(slide, { toValue: 0, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else {
      Animated.timing(slide, { toValue: -60, duration: 250, useNativeDriver: true }).start();
    }
  }, [status, hidden]);

  // Показываем только если есть отклик от сервера и статус не pending/guest
  const shouldShow = status
    && status !== 'approved'
    && verificationLevel >= 2         // показываем только кто уже начал регистрацию (селфи пройден)
    && !hidden;

  if (!shouldShow) return null;

  const cfg = CONFIG[status] || CONFIG.pending;

  return (
    <Animated.View style={[
      s.wrap,
      { backgroundColor: cfg.color, transform: [{ translateY: slide }] },
    ]}>
      <Text style={s.emoji}>{cfg.emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={s.title}>{cfg.title}</Text>
        <Text style={s.body}>{cfg.body}</Text>
      </View>
      <TouchableOpacity onPress={() => setHidden(true)} style={s.closeBtn}>
        <Text style={{ color: '#FFF', fontSize: 18, fontWeight: '700' }}>×</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
  },
  emoji: { fontSize: 22 },
  title: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  body: { color: 'rgba(255,255,255,0.9)', fontSize: 11, marginTop: 1 },
  closeBtn: { padding: 6, minWidth: 28, alignItems: 'center' },
});
