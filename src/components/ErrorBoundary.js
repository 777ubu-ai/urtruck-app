import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform } from 'react-native';
import { API_BASE } from '../config/env';
import { t } from '../utils/i18n';
import { ThemeContext } from '../utils/ThemeContext';

// ErrorBoundary — last-resort crash catcher.
//
// Stage 25 fix:
//   * Always print the full stack and componentStack to console
//     even before the network log call, so the operator gets a
//     usable trace even when /errors endpoint is down.
//   * In dev/QA (`__DEV__` or `?qa=1` URL flag) show the actual
//     error message + first lines of stack on screen — invisible
//     reload-and-pray was hiding real bugs from the developer.
//   * In production keep the friendly screen (no stack), but the
//     reload button now also offers a "soft reset" via a navigation
//     bus event when web reload isn't possible.
//   * Network log fails silently (no nested error boundary): if
//     `/errors` endpoint isn't deployed yet the boundary itself
//     mustn't crash on top of the original crash.

const LOG_URL = `${API_BASE}/errors`;

function isDevSurface() {
  if (typeof __DEV__ !== 'undefined' && __DEV__) return true;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const params = new URLSearchParams(window.location.search || '');
      return params.get('qa') === '1' || params.get('debug') === '1';
    } catch {
      return false;
    }
  }
  return false;
}

// Stage 29: even in production, ВСЕГДА показывать stack на
// crash-экране — пользователь / владелец сможет переслать
// нам конкретный stack вместо «Что-то пошло не так». В dev /
// ?debug=1 stack виден ВЕЗДЕ (включая режим before-crash);
// в production stack виден только когда ErrorBoundary
// действительно сработал.
const ALWAYS_SHOW_STACK_ON_CRASH = true;

export default class ErrorBoundary extends React.Component {
  // P1 theme-consistency (25.08.2026): a crash screen rendered light-only
  // regardless of theme is exactly the "light error screen inside dark UI"
  // case the audit called out — this is a class component, so it subscribes
  // via static contextType instead of useTheme().
  static contextType = ThemeContext;

  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Console first: always logged regardless of network reachability.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] caught:', error?.message || error);
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] stack:', error?.stack);
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] componentStack:', errorInfo?.componentStack);
    // Stage 29: write last-known frontend state into window so
    // the operator can copy it from the production browser.
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        window.__URTRUCK_LAST_CRASH__ = {
          message: error?.message,
          stack: error?.stack,
          componentStack: errorInfo?.componentStack,
          url: window.location.href,
          timestamp: new Date().toISOString(),
        };
      } catch {}
    }

    this.setState({ info: errorInfo });

    // Best-effort upstream log; ignore failures so we don't recurse.
    try {
      fetch(LOG_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: error?.message || String(error),
          stack: (error?.stack || '').slice(0, 2000),
          component: (errorInfo?.componentStack || '').slice(0, 1000),
          url: Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.href : 'native',
          timestamp: new Date().toISOString(),
          appVersion: '1.0.0',
        }),
      }).catch(() => {});
    } catch {
      // never let the boundary itself blow up
    }
  }

  reset = () => {
    this.setState({ hasError: false, error: null, info: null });
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try { window.location.reload(); } catch {}
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const dev = isDevSurface() || ALWAYS_SHOW_STACK_ON_CRASH;
    const msg = this.state.error?.message || String(this.state.error || 'unknown');
    const stack = (this.state.error?.stack || '').split('\n').slice(0, 8).join('\n');
    const comp = (this.state.info?.componentStack || '').split('\n').slice(0, 8).join('\n');
    // this.context resolves to ThemeContext's default value (lightTheme)
    // when no ThemeProvider is mounted above the boundary, so `.theme` is
    // always defined.
    const s = makeStyles(this.context.theme);

    return (
      <ScrollView contentContainerStyle={s.container} testID="error-boundary">
        <Text style={s.emoji}>⚠️</Text>
        <Text style={s.title}>{t('error_title')}</Text>
        <Text style={s.body}>{t('error_desc')}</Text>

        {dev ? (
          <View style={s.devBlock} testID="error-boundary-dev">
            <Text style={s.devLabel}>error.message</Text>
            <Text style={s.devText}>{msg}</Text>
            {stack ? (
              <>
                <Text style={s.devLabel}>error.stack</Text>
                <Text style={s.devTextSmall}>{stack}</Text>
              </>
            ) : null}
            {comp ? (
              <>
                <Text style={s.devLabel}>componentStack</Text>
                <Text style={s.devTextSmall}>{comp}</Text>
              </>
            ) : null}
          </View>
        ) : null}

        <TouchableOpacity style={s.btn} onPress={this.reset} testID="error-boundary-reload">
          <Text style={s.btnText}>{t('error_reload')}</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }
}

// P1 theme-consistency: the crash screen must follow the resolved theme too
// — a stranded light screen after a crash is the worst possible moment for
// a jarring light/dark mismatch. Dev-error-detail red stays a semantic
// danger constant across both themes.
const makeStyles = (theme) => StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: theme.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  emoji: { fontSize: 56, marginBottom: 16 },
  title: { color: theme.text, fontSize: 22, fontWeight: '800', marginBottom: 10, textAlign: 'center' },
  body: { color: theme.textMuted, fontSize: 14, textAlign: 'center', marginBottom: 16 },
  devBlock: {
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
    borderColor: '#7F1D1D',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 18,
    width: '100%',
    maxWidth: 520,
  },
  devLabel: { color: '#B91C1C', fontSize: 11, fontWeight: '800', marginTop: 6, letterSpacing: 0.4 },
  devText: { color: '#7F1D1D', fontSize: 13, fontWeight: '700', marginTop: 2 },
  devTextSmall: { color: '#B91C1C', fontSize: 11, marginTop: 2, fontFamily: Platform.OS === 'web' ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined },
  btn: {
    backgroundColor: '#168759',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
  },
  btnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
