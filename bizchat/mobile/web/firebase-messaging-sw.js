// Service worker для FCM на web.
//
// **Важно:** этот файл должен лежать в корне web/ — Firebase Messaging
// web SDK ищет его строго по пути `/firebase-messaging-sw.js`.
//
// **Project уже создан** (`bizchat-4d11d`), но Web app в Firebase Console пока
// **НЕ добавлен** — нужны firebaseConfig (из Add app → Web) и VAPID key
// (Cloud Messaging → Web Push certificates → Generate key pair).
//
// Чтобы включить background push на web:
//   1. Firebase Console → bizchat-4d11d → Project Settings → General →
//      Your apps → Add app → Web (icon `</>`)
//   2. Bundle id любой, например `bizchat-web`. Скопировать `firebaseConfig`
//   3. Заменить значения в self.firebaseConfig ниже + продублировать
//      apiKey/appId в `mobile/lib/firebase_options.dart` → `web` блок
//   4. Получить VAPID: Cloud Messaging → Web Push certificates → Generate key pair
//   5. Запускать flutter с `--dart-define=PUSH_VAPID_KEY=<vapid>`
//   6. ПЕРЕЗАПУСТИТЬ flutter run (sw кешируется в браузере жёстко — Cmd+Shift+R)
//
// Без правильного конфига этот sw не сможет получать пуши, но не будет ломать
// приложение — браузер просто не зарегистрирует его (silent fail в console).
// На Android/iOS нативных пушах это не сказывается — там работает через
// google-services.json / GoogleService-Info.plist напрямую.

// eslint-disable-next-line no-undef
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
// eslint-disable-next-line no-undef
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');

self.firebaseConfig = {
  apiKey: 'PLACEHOLDER',
  authDomain: 'PLACEHOLDER',
  projectId: 'PLACEHOLDER',
  storageBucket: 'PLACEHOLDER',
  messagingSenderId: 'PLACEHOLDER',
  appId: 'PLACEHOLDER',
};

if (self.firebaseConfig.apiKey !== 'PLACEHOLDER') {
  // eslint-disable-next-line no-undef
  firebase.initializeApp(self.firebaseConfig);
  // eslint-disable-next-line no-undef
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage(function (payload) {
    const notification = payload.notification || {};
    const title = notification.title || 'Biz Chat';
    const options = {
      body: notification.body || '',
      icon: '/icons/Icon-192.png',
      badge: '/icons/Icon-192.png',
      data: payload.data || {},
    };
    return self.registration.showNotification(title, options);
  });
}
