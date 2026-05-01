import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { API_BASE } from '../config/env';
import { t } from '../utils/i18n';

const LOG_URL = `${API_BASE}/errors`;

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
    // Отправка на бэк
    try {
      fetch(LOG_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: error?.message || String(error),
          stack: error?.stack?.slice(0, 2000),
          component: errorInfo?.componentStack?.slice(0, 1000),
          url: Platform.OS === 'web' ? window.location.href : 'native',
          timestamp: new Date().toISOString(),
        }),
      }).catch(() => {});
    } catch {}
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={s.container}>
          <Text style={s.emoji}>⚠️</Text>
          <Text style={s.title}>{t('error_title')}</Text>
          <Text style={s.body}>
            {t('error_desc')}
          </Text>
          {/* Технический текст скрыт от юзера — только в console.error */}
          <TouchableOpacity
            style={s.btn}
            onPress={() => {
              this.setState({ hasError: false, error: null });
              if (Platform.OS === 'web') window.location.reload();
            }}
          >
            <Text style={s.btnText}>{t('error_reload')}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const s = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#0a0f1a',
    alignItems: 'center', justifyContent: 'center', padding: 30,
  },
  emoji: { fontSize: 56, marginBottom: 16 },
  title: { color: '#F0F4F0', fontSize: 22, fontWeight: '800', marginBottom: 10 },
  body: { color: '#78716C', fontSize: 14, textAlign: 'center', marginBottom: 16 },
  detail: { color: '#EF4444', fontSize: 11, textAlign: 'center', marginBottom: 20, maxWidth: 300 },
  btn: {
    backgroundColor: '#1A5C3C', paddingHorizontal: 28, paddingVertical: 14,
    borderRadius: 14,
  },
  btnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
