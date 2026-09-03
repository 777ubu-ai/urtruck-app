import React, { useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Platform, AppState, Linking } from 'react-native';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './src/utils/ThemeContext';
import { AuthProvider, useAuth } from './src/utils/AuthContext';
import { ToastProvider } from './src/components/Toast';
import OfflineBanner from './src/components/OfflineBanner';
import PushPermissionBanner from './src/components/PushPermissionBanner';
import ErrorBoundary from './src/components/ErrorBoundary';
import AppNavigator from './src/navigation/AppNavigator';
import { flushOutbox } from './src/utils/outbox';
// Фоновый GPS: сам импорт регистрирует TaskManager-таску (обязательно на
// верхнем уровне, до маунта) — старт/стоп управляется из broadcast-хука.
import './src/utils/backgroundLocation';
import { captureSocialCallbackUrl } from './src/utils/socialAuth';

// P0 auth-fix 28.08.2026 («двойной тап Google»): возврат из OAuth ловили
// только СМОНТИРОВАННЫЕ экраны (PhoneV2/OnboardingV2). На native есть мёртвое
// окно: приложение перезапускается после браузера Google (AuthContext.loading
// → пустой экран → карусель), и 'url'-событие с callback приходит раньше, чем
// хоть один экран подписался — терялось, пользователь падал на карусель и жал
// Google второй раз. Подписка НА УРОВНЕ МОДУЛЯ (до маунта React, как
// backgroundLocation выше) буферизует callback; OnboardingV2/PhoneV2 забирают
// его при монтировании через takeBufferedSocialCallbackUrl().
if (Platform.OS !== 'web') {
  try {
    Linking.addEventListener('url', ({ url }) => captureSocialCallbackUrl(url));
  } catch {}
}
import { chatAPI } from './src/utils/chatAPI';
import { push } from './src/utils/push';
import * as Sentry from '@sentry/react-native';

// Глобально убираем браузерную синюю обводку фокуса (outline) с полей ввода и
// нажимаемых элементов на web/PWA. react-native-web рендерит TextInput как
// <input>/<textarea>, и браузер рисует свою рамку ПОВЕРХ нашей — жалоба
// владельца 01.08 («синий квадратик заново поверх рамки, убрать везде»).
// Одна инъекция вместо outlineStyle на каждом инпуте. Нативной сборки не
// касается (Platform.OS !== 'web').
if (Platform.OS === 'web' && typeof document !== 'undefined' && !document.getElementById('ur-no-outline')) {
  const style = document.createElement('style');
  style.id = 'ur-no-outline';
  style.textContent = `
    input, textarea, select, button, [contenteditable] { outline: none !important; }
    input:focus, textarea:focus, select:focus, button:focus, [contenteditable]:focus,
    [tabindex]:focus, [role="button"]:focus, a:focus {
      outline: none !important;
      box-shadow: none !important;
    }
    * { -webkit-tap-highlight-color: transparent; }
  `;
  document.head.appendChild(style);
}

// Sentry — мониторинг падений САМОГО приложения (у пользователей на телефонах).
// Полноценно оживает в нативной сборке (build 42+); в Expo Go нативного модуля
// нет — тогда работает как no-op, приложение не падает. DSN можно переопределить
// через EXPO_PUBLIC_SENTRY_DSN (напр. отдельный проект React Native).
// PII не отправляем (send_default_pii=false) — ИИН/ФИО/телефоны не уходят.
const _SENTRY_DSN =
  process.env.EXPO_PUBLIC_SENTRY_DSN ||
  'https://18453143e7167ce08c98f2ce0d90bfd2@o4511743497273344.ingest.de.sentry.io/4511743527354448';
try {
  Sentry.init({
    dsn: _SENTRY_DSN,
    environment: process.env.EXPO_PUBLIC_SENTRY_ENV || 'production',
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    enableNativeFramesTracking: false,
  });
} catch (e) {
  // Нет нативного модуля (Expo Go) / иная причина — не мешаем запуску.
  console.warn('[sentry] init skipped:', e && e.message);
}

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
  let cleaned = url.trim();
  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      cleaned = `${parsed.pathname || ''}${parsed.search || ''}`;
    } else if (parsed.protocol === 'urtruck:' || parsed.protocol === 'com.urtruck.app:') {
      const hostPart = parsed.hostname ? `/${parsed.hostname}` : '';
      cleaned = `${hostPart}${parsed.pathname || ''}${parsed.search || ''}`;
    }
  } catch {
    // Relative url or malformed external payload — fall back to legacy cleanup.
  }
  cleaned = cleaned.replace(/^\/+/, '');
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

function navigateFromUrl(navRef, url, role) {
  if (!navRef?.current) return;
  const parsed = parseNotifUrl(url);
  if (!parsed) return;
  const { kind, id, params } = parsed;
  try {
    if (kind === 'cargos' && id) {
      // BUG-005: прокидываем role, чтобы экран открылся в правильном виде.
      navRef.current.navigate('CargoDetail', { cargoId: id, bidId: params.bid || null, role });
    } else if (kind === 'trips' && id) {
      navRef.current.navigate('TripDetail', { tripId: id, bidId: params.bid || null, role });
    } else if (kind === 'deals' && id) {
      // BUG-002: deals → Deal Room (ChatScreen с dealId), как в
      // NotificationsScreen. Раньше кидало в общий список чатов без контекста.
      navRef.current.navigate('Chat', { dealId: id, role });
    } else if (kind === 'chats' && id) {
      navRef.current.navigate('Chat', { roomId: id, role });
    } else if (kind === 'chat' || kind === 'chats') {
      navRef.current.navigate('ChatsList');
    } else if (kind === 'profile') {
      // Раньше пуши про отзыв/статус документов слали url="/profile", а парсер
      // его не знал → тап падал в дефолтный экран. Профиль — pushed-экран стека.
      navRef.current.navigate('Profile');
    } else if (kind === 'notifications') {
      navRef.current.navigate('Notifications');
    } else if (kind === 'auth' && params.token) {
      // Магик-линк из email-письма: urtruck://auth?token=... или
      // https://urtruck.kz/auth?token=... — открывает приложение и
      // подтверждает вход без ручного ввода кода. Требует backend endpoint
      // POST /register/verify-magic-link (см. регистрацию.py). Пока endpoint
      // не готов — фронт передаёт token в OtpV2 через params.magicToken;
      // тот проверит его через regAPI.verifyMagicLink и завершит логин.
      navRef.current.navigate('OtpV2', { channel: 'email', magicToken: params.token });
    }
  } catch (e) {
    console.warn('[push] navigate failed:', e?.message);
  }
}

async function isQa2RuntimePackage() {
  if (Platform.OS !== 'android') return false;
  try {
    const Application = require('expo-application');
    return Application?.applicationId === 'com.urtruck.app.qa2';
  } catch {
    return false;
  }
}

function parseQaAuthUrl(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = new URL(url.trim());
    const isUrtruckScheme = (
      parsed.protocol === 'urtruck:'
      || parsed.protocol === 'com.urtruck.app:'
      || parsed.protocol === 'com.urtruck.app.qa2:'
    );
    const isQaAuth = parsed.hostname === 'qa-auth' || parsed.pathname === '/qa-auth';
    const token = parsed.searchParams.get('token');
    if (!isUrtruckScheme || !isQaAuth || !token) return null;
    const role = parsed.searchParams.get('role') || null;
    return { token, role };
  } catch {
    return null;
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
  const { session, hasToken, signIn, setRole, refreshLevel } = useAuth();
  const { theme, isDark } = useTheme();

  // Фон САМОГО навигатора (не только сцены). Без theme у NavigationContainer
  // берётся DefaultTheme с БЕЛЫМ фоном — и он просвечивал снизу, под прозрачным
  // плавающим таб-баром (белая полоса в зоне home-indicator на тёмной теме).
  // Привязываем фон навигатора к текущей теме → полоса совпадает с фоном экрана.
  const base = isDark ? DarkTheme : DefaultTheme;
  const navTheme = { ...base, colors: { ...base.colors, background: theme.bg } };

  // Авторизован ли для «глубоких» экранов (Chat/ChatsList/CargoDetail…) —
  // они существуют только в полном стеке (session + роль). До этого маршрут
  // отсутствует, navigate падал и тап по пушу «терялся».
  const authedForDeepLink = !!(session && session.user && session.user.role);

  // P5: единая точка навигации по url из пуша. Если навигатор не готов или
  // пользователь ещё не в авторизованном стеке — откладываем url и повторим,
  // когда всё будет готово (см. useEffect ниже и onReady у контейнера).
  const routeFromUrl = (url) => {
    if (!url) return;
    const qaAuth = parseQaAuthUrl(url);
    if (qaAuth) {
      isQa2RuntimePackage().then(async (allowed) => {
        if (!allowed) return;
        try {
          await signIn('qa-actor', 3, qaAuth.token);
          const me = await refreshLevel().catch(() => null);
          const role = me?.role && me.role !== 'guest' ? me.role : qaAuth.role;
          if (role) setRole(role);
          const pushResult = await push.autoRegister?.().catch((e) => ({ ok: false, reason: e?.message || 'error' }));
          console.warn('[qa-auth] login applied', { role: role || null, push: pushResult?.ok ? 'ok' : (pushResult?.reason || 'failed') });
        } catch (e) {
          console.warn('[qa-auth] login failed:', e?.message);
        }
      }).catch(() => {});
      return;
    }
    const parsed = parseNotifUrl(url);
    const needsAuth = parsed && ['chats', 'chat', 'deals', 'cargos', 'trips', 'profile', 'notifications'].includes(parsed.kind);
    if (!navReadyRef.current || !navRef.current || (needsAuth && !authedForDeepLink)) {
      pendingUrlRef.current = url;  // отложить
      return;
    }
    navigateFromUrl(navRef, url, session?.user?.role);
  };

  // Повторяем отложенный deep-link, когда появилась авторизация (или навигатор
  // стал готов через onReady, который тоже дергает routeFromUrl).
  useEffect(() => {
    if (pendingUrlRef.current && navReadyRef.current && authedForDeepLink) {
      const u = pendingUrlRef.current;
      pendingUrlRef.current = null;
      // P3-fix: передаём role — иначе отложенный deeplink доигрывался без
      // роли и CargoDetail/TripDetail открывались в неправильном виде.
      setTimeout(() => navigateFromUrl(navRef, u, session?.user?.role), 250);
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

  // App/universal links outside push taps: urtruck://notifications,
  // https://urtruck.kz/notifications и другие поддержанные url должны
  // открывать те же экраны, что и tap по push. Unknown/social-auth urls
  // спокойно игнорируются parseNotifUrl/navigateFromUrl.
  //
  // P0 2026-09-03 (root cause найден статическим анализом + прежним
  // физическим наблюдением «[deal-deeplink] cold start → Граница →
  // спонтанный прыжок в чат сделки»): Linking.getInitialURL() по контракту
  // RN/платформы возвращает ОДИН И ТОТ ЖЕ url при каждом вызове в течение
  // жизни процесса — он не консьюмится сам. Раньше эффект зависел от
  // [authedForDeepLink], который меняется асинхронно во время буутстрапа
  // (session/role подгружаются, могут временно обнулиться и
  // восстановиться) → эффект пересоздавался → getInitialURL() вызывался
  // повторно → тот же исходный deep-link прогонялся через routeFromUrl()
  // ещё раз, уже посреди сессии, без единого действия пользователя.
  // Фикс: getInitialURL() вызывается РОВНО ОДИН РАЗ за жизнь процесса
  // ([] deps); свежий authedForDeepLink достаётся через ref-обёртку, а не
  // через пересоздание эффекта. Отложенный deep-link по-прежнему
  // consume-once обрабатывается pendingUrlRef (эффект выше).
  const routeFromUrlRef = useRef(routeFromUrl);
  routeFromUrlRef.current = routeFromUrl;
  useEffect(() => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
    let active = true;
    Linking.getInitialURL()
      .then((url) => {
        if (active && url) routeFromUrlRef.current(url);
      })
      .catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => {
      if (url) routeFromUrlRef.current(url);
    });
    return () => {
      active = false;
      sub?.remove?.();
    };
  }, []);

  // Native (iOS/Android) — tap по пушу в фоне/закрытом приложении + cold start.
  useEffect(() => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
    let Notifications;
    try { Notifications = require('expo-notifications'); } catch { return; }
    // BUG-006: getLastNotificationResponseAsync (запускающий тап) и listener
    // на части версий Expo SDK срабатывают ОБА для одного и того же тапа →
    // двойная навигация. Дедуп по identifier уведомления в общем замыкании.
    const handled = new Set();
    const handleResponse = (response) => {
      const rid = response?.notification?.request?.identifier;
      if (rid) {
        if (handled.has(rid)) return;
        handled.add(rid);
      }
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
    // P1 30.08.2026: activeUserId ОБЯЗАТЕЛЕН. Без него защита владельца из
    // flushOutbox (Блок 2, P1-5) обходилась: `item.userId && activeUserId &&
    // ...` при activeUserId === undefined всегда ложно, поэтому очередь
    // ПРЕДЫДУЩЕГО пользователя этого устройства уезжала под текущей сессией.
    const doFlush = () => { flushOutbox((p) => chatAPI.send(p), session?.user?.id).catch(() => {}); };
    doFlush();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') doFlush(); });
    return () => sub?.remove?.();
  }, [hasToken, session?.user?.id]);

  // P5: пере-регистрация push-токена на запуске для уже залогиненного юзера.
  // Раньше autoRegister звался только сразу после OTP — при ротации Expo-токена
  // (обновление/переустановка приложения) пуши переставали доходить до
  // следующего логина. Теперь обновляем токен на бэке при каждом старте.
  useEffect(() => {
    if (!hasToken) return;
    let lastAttempt = 0;
    const refreshPushBinding = () => {
      const now = Date.now();
      // Avoid duplicate native calls during rapid active/inactive transitions,
      // while still repairing a rotated token after returning from background.
      if (now - lastAttempt < 30_000) return;
      lastAttempt = now;
      push.autoRegister?.().catch(() => {});
    };
    refreshPushBinding();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshPushBinding();
    });
    return () => sub?.remove?.();
  }, [hasToken]);

  return (
    <SafeAreaProvider>
      <ToastProvider>
        <OfflineBanner />
        <PushPermissionBanner enabled={hasToken} />
        <NavigationContainer
          ref={navRef}
          theme={navTheme}
          onReady={() => { navReadyRef.current = true; if (pendingUrlRef.current) routeFromUrl(pendingUrlRef.current); }}
        >
          <StatusBar style="light" />
          <AppNavigator />
        </NavigationContainer>
      </ToastProvider>
    </SafeAreaProvider>
  );
}

function App() {
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

// Sentry.wrap — оборачивает корень для перехвата крашей рендера/навигации.
export default Sentry.wrap(App);
