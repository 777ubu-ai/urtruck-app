import React, { useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from './src/utils/ThemeContext';
import { AuthProvider } from './src/utils/AuthContext';
import { ToastProvider } from './src/components/Toast';
import OfflineBanner from './src/components/OfflineBanner';
// VerificationStatusBanner removed — after OTP users get full access
// import VerificationStatusBanner from './src/components/VerificationStatusBanner';
import ErrorBoundary from './src/components/ErrorBoundary';
import AppNavigator from './src/navigation/AppNavigator';

// PR-C2 (chat / push P0): парсер url для notification tap navigation.
// Backend кладёт в notification url относительный путь:
//   /cargos/{id}?bid={bid_id}
//   /trips/{id}?bid={bid_id}
//   /deals/{id}
//   /chats/{id}, /chat
// Этот же парсер живёт в NotificationsScreen для in-app таппа; здесь
// он нужен для обработки tap на нативный push когда приложение
// свёрнуто или закрыто, и web service-worker postMessage для PWA.
function parseNotifUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const cleaned = url.replace(/^https?:\/\/[^/]+/i, '').replace(/^\/+/, '');
  if (!cleaned) return null;
  const [pathPart, queryPart = ''] = cleaned.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  if (segments.length === 0) return null;
  const kind = segments[0].toLowerCase();
  const id = segments[1] || null;
  const params = {};
  if (queryPart) {
    for (const part of queryPart.split('&')) {
      if (!part) continue;
      const [rawK, rawV = ''] = part.split('=');
      if (!rawK) continue;
      try { params[decodeURIComponent(rawK)] = decodeURIComponent(rawV); }
      catch { params[rawK] = rawV; }
    }
  }
  return { kind, id, params };
}

function navigateFromUrl(navRef, url) {
  if (!navRef?.current) return;
  const parsed = parseNotifUrl(url);
  if (!parsed) return;
  const { kind, id, params } = parsed;
  try {
    if (kind === 'cargos' && id) {
      navRef.current.navigate('CargoDetail', { cargoId: id, bidId: params.bid || null });
    } else if (kind === 'trips' && id) {
      navRef.current.navigate('TripDetail', { tripId: id, bidId: params.bid || null });
    } else if (kind === 'deals' && id) {
      navRef.current.navigate('ChatsList');
    } else if (kind === 'chats' && id) {
      navRef.current.navigate('Chat', { roomId: id });
    } else if (kind === 'chat' || kind === 'chats') {
      navRef.current.navigate('ChatsList');
    }
  } catch (e) {
    console.warn('[push] navigate failed:', e?.message);
  }
}

// Welcome-splash показывает НАТИВНЫЙ splash (app.json → urtruck-splash.png,
// resizeMode contain) — он сам уходит, когда отрисован первый кадр JS. JS-оверлей
// убран (14.06): он накладывался на первый слайд онбординга (там своя такая же
// картинка) → при затухании двоилось «UrTruck». Нативного splash достаточно.

export default function App() {
  const navRef = useRef();

  // Web (PWA) — Service Worker уже умеет showNotification и postMessage
  // при tap (см. sw-template.js). Подписываемся на 'message' с
  // type='notification' и навигируем по url.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined') return;
    const handler = (event) => {
      if (event.data?.type === 'notification' && event.data.url) {
        navigateFromUrl(navRef, event.data.url);
      }
    };
    navigator.serviceWorker?.addEventListener('message', handler);
    return () => navigator.serviceWorker?.removeEventListener('message', handler);
  }, []);

  // PR-C2 (P0 push tap navigation): на iOS/Android нативный push'и
  // приходят через expo-notifications. До этого pomenta был только
  // setNotificationHandler в push.js (показывает banner в foreground),
  // но НЕ было реакции на tap (background/closed). Тап открывал app
  // на ровном месте — пользователь не понимал что произошло.
  // Подписываемся на:
  //   - addNotificationResponseReceivedListener — пользователь тапнул
  //   - getLastNotificationResponseAsync — initial entry если app
  //     стартовал из push'a (cold start)
  // url достаём из notification.data — backend кладёт его в
  // payload.data.url через push_sender.send.
  useEffect(() => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
    let Notifications;
    try { Notifications = require('expo-notifications'); }
    catch { return; }

    const handleResponse = (response) => {
      const url = response?.notification?.request?.content?.data?.url;
      if (url) navigateFromUrl(navRef, url);
    };

    // Cold start case
    Notifications.getLastNotificationResponseAsync?.()
      .then((resp) => { if (resp) handleResponse(resp); })
      .catch(() => {});

    const sub = Notifications.addNotificationResponseReceivedListener?.(handleResponse);
    return () => { sub?.remove?.(); };
  }, []);

  return (
    <ErrorBoundary>
    <ThemeProvider>
      <AuthProvider>
        <SafeAreaProvider>
          <ToastProvider>
            <OfflineBanner />
            <NavigationContainer ref={navRef}>
              <StatusBar style="light" />
              <AppNavigator />
            </NavigationContainer>
          </ToastProvider>
        </SafeAreaProvider>
      </AuthProvider>
    </ThemeProvider>
    </ErrorBoundary>
  );
}
