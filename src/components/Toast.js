import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity, Platform } from 'react-native';
import { useTheme } from '../utils/ThemeContext';

const ToastContext = createContext({ toast: () => {} });

export const useToast = () => useContext(ToastContext);

let toastIdCounter = 0;

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useCallback((text, type = 'info', duration = 3000) => {
    // PR-C2 defence-in-depth: если кто-то случайно передал object вместо
    // string (например `error.detail` от FastAPI 403 verification_required),
    // не падаем с React error #31. Делаем JSON.stringify fallback.
    let safeText;
    if (text == null) safeText = '';
    else if (typeof text === 'string') safeText = text;
    else if (typeof text === 'object') {
      safeText = text.hint || text.error || text.message
        || (() => { try { return JSON.stringify(text); } catch { return ''; } })();
    } else {
      safeText = String(text);
    }
    setToasts(prev => {
      // Дедупликация: не показывать одинаковый текст если уже есть
      if (prev.some(t => t.text === safeText)) return prev;
      // Лимит: максимум 3 тоста одновременно
      const limited = prev.length >= 3 ? prev.slice(1) : prev;
      const id = ++toastIdCounter;
      setTimeout(() => remove(id), duration);
      return [...limited, { id, text: safeText, type }];
    });
  }, [remove]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <View style={s.container} pointerEvents="box-none">
        {toasts.map((t, i) => <ToastItem key={t.id} toast={t} onClose={() => remove(t.id)} index={i} />)}
      </View>
    </ToastContext.Provider>
  );
};

const COLORS = {
  success: { bg: '#168759', icon: '✓' },
  error: { bg: '#EF4444', icon: '✕' },
  info: { bg: '#334155', icon: 'ℹ' },
  warn: { bg: '#FF8400', icon: '⚠' },
};

function ToastItem({ toast, onClose, index }) {
  const { theme } = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 6 }),
    ]).start();
  }, []);

  const c = COLORS[toast.type] || COLORS.info;
  return (
    <Animated.View style={[s.toast, { backgroundColor: theme.card, borderColor: c.bg, opacity, transform: [{ translateY }], top: 60 + index * 70 }]}>
      <View style={[s.iconWrap, { backgroundColor: c.bg }]}><Text style={s.icon}>{c.icon}</Text></View>
      <Text style={[s.text, { color: theme.text }]} numberOfLines={3}>{toast.text}</Text>
      <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Text style={[s.close, { color: theme.textMuted }]}>✕</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: {
    position: 'absolute', top: 0, left: 0, right: 0,
    alignItems: 'center', zIndex: 9999,
  },
  toast: Platform.OS === 'web' ? {
    position: 'absolute',
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 14, borderWidth: 1, borderLeftWidth: 4,
    minWidth: 280, maxWidth: '90%',
    backdropFilter: 'blur(20px) saturate(180%)',
    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
    boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
  } : {
    position: 'absolute',
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 14, borderWidth: 1, borderLeftWidth: 4,
    minWidth: 280, maxWidth: '90%',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  iconWrap: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  icon: { color: '#fff', fontSize: 14, fontWeight: '900' },
  text: { flex: 1, fontSize: 13, fontWeight: '600' },
  close: { fontSize: 16, fontWeight: '700' },
});
