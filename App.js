import React, { useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Platform, AppState } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from './src/utils/ThemeContext';
import { AuthProvider, useAuth } from './src/utils/AuthContext';
import { ToastProvider } from './src/components/Toast';
import OfflineBanner from './src/components/OfflineBanner';
// VerificationStatusBanner removed — after OTP users get full access
// import VerificationStatusBanner from './src/components/VerificationStatusBanner';
import ErrorBoundary from './src/components/ErrorBoundary';
import AppNavigator from './src/navigation/AppNavigator';
import { flushOutbox } from './src/utils/outbox';
import { chatAPI } from './src/utils/chatAPI';
import { push } from './src/utils/push';

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

// Welcome-splash показывает НАТИВНЫЙ splash (app.json → splash.image), он сам
// уходит, когда отрисован первый кадр JS. JS-оверлей убран (баг: всплывал ПОВЕРХ
// уже загруженной ленты → «двоение UrTruck», как и в предыдущий раз 14.06).
// Нативного splash достаточно во всех прод-сборках.

// AppInner живёт ПОД AuthProvider — поэтому знает состояние сессии и может
// (а) откладывать deep-link до готовности навигатора и авторизованного стека,
// (б) прогонять офлайн-очередь чата глобально, (в) пере-регистрировать push
// на запуске (лечит ротацию Expo-токена).
function AppInner() {
  const navRef = useRef();
  const navReadyRef = useRef(false);
  const pendingUrlRef = useRef(null);
  const { session, hasToken } = useAuth();

  // Авторизован ли для «глубоких» экранов (Chat/ChatsList/CargoDetail…) —
  // они существуют только в полном стеке (session + роль). До этого маршрут
  // отсутствует, navigate падал и тап по пушу «терялся».
  const authedForDeepLink = !!(session && session.user && session.user.role);

  // P5: единая точка навигации по url из пуша. Если навигатор не готов или
  // пользователь ещё не в авторизованном стеке — откладываем url и повторим,
  // когда всё будет готово (см. useEffect ниже и onReady у контейнера).
  const routeFromUrl = (url) => {
    if (!url) return;
    const parsed = parseNotifUrl(url);
    const needsAuth = parsed && ['chats', 'chat', 'deals', 'cargos', 'trips'].includes(parsed.kind);
    if (!navReadyRef.current || !navRef.current || (needsAuth && !authedForDeepLink)) {
      pendingUrlRef.current = url;  // отложить
      return;
    }
    navigateFromUrl(navRef, url);
  };

  // Повторяем отложенный deep-link, когда появилась авторизация (или навигатор
  // стал готов через onReady, который тоже дергает routeFromUrl).
  useEffect(() => {
    if (pendingUrlRef.current && navReadyRef.current && authedForDeepLink) {
      const u = pendingUrlRef.current;
      pendingUrlRef.current = null;
      setTimeout(() => navigateFromUrl(navRef, u), 250);
    }
  }, [authedForDeepLink]);

  // Web (PWA) — Service Worker присылает postMessage при tap по уведомлению.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined') return;
    const handler = (event) => {
      if (event.data?.type === 'notification' && event.data.url) routeFromUrl(event.data.url);
    };
    navigator.serviceWorker?.addEventListener('message', handler);
    return () => navigator.serviceWorker?.removeEventListener('message', handler);
  }, [authedForDeepLink]);

  // Native (iOS/Android) — tap по пушу в фоне/закрытом приложении + cold start.
  useEffect(() => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
    let Notifications;
    try { Notifications = require('expo-notifications'); } catch { return; }
    const handleResponse = (response) => {
      const url = response?.notification?.request?.content?.data?.url;
      if (url) routeFromUrl(url);
    };
    Notifications.getLastNotificationResponseAsync?.()
      .then((resp) => { if (resp) handleResponse(resp); })
      .catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener?.(handleResponse);
    return () => { sub?.remove?.(); };
  }, [authedForDeepLink]);

  // P2: глобальный прогон офлайн-очереди чата — на старте и при возврате
  // приложения в active (сеть могла восстановиться). Раньше flush был привязан
  // только к открытому ChatScreen → неотправленный текст застревал, пока юзер
  // не переоткроет тот же чат. Backend идемпотентен по client_msg_id — дублей нет.
  useEffect(() => {
    if (!hasToken) return;
    const doFlush = () => { flushOutbox((p) => chatAPI.send(p)).catch(() => {}); };
    doFlush();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') doFlush(); });
    return () => sub?.remove?.();
  }, [hasToken]);

  // P5: пере-регистрация push-токена на запуске для уже залогиненного юзера.
  // Раньше autoRegister звался только сразу после OTP — при ротации Expo-токена
  // (обновление/переустановка приложения) пуши переставали доходить до
  // следующего логина. Теперь обновляем токен на бэке при каждом старте.
  useEffect(() => {
    if (!hasToken) return;
    push.autoRegister?.().catch(() => {});
  }, [hasToken]);

  return (
    <SafeAreaProvider>
      <ToastProvider>
        <OfflineBanner />
        <NavigationContainer
          ref={navRef}
          onReady={() => { navReadyRef.current = true; if (pendingUrlRef.current) routeFromUrl(pendingUrlRef.current); }}
        >
          <StatusBar style="light" />
          <AppNavigator />
        </NavigationContainer>
      </ToastProvider>
    </SafeAreaProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
    <ThemeProvider>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </ThemeProvider>
    </ErrorBoundary>
  );
}
