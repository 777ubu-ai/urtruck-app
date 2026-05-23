import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
import { t } from '../utils/i18n';

export default function OfflineBanner() {
  const [online, setOnline] = useState(true);
  const opacity = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    Animated.timing(opacity, { toValue: online ? 0 : 1, duration: 240, useNativeDriver: true }).start();
  }, [online]);

  if (online) return null;
  return (
    <Animated.View style={[s.wrap, { opacity }]} pointerEvents={online ? 'none' : 'auto'}>
      <Text style={s.icon}>📡</Text>
      <Text style={s.text}>{t('offline_banner_text')}</Text>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10000,
    backgroundColor: '#EF4444',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingVertical: 8,
  },
  icon: { fontSize: 14 },
  text: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
