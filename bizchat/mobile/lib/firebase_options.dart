// Реальный конфиг Firebase для проекта `bizchat-4d11d`.
//
// Значения для Android и iOS взяты из настоящих файлов:
//   - mobile/android/app/google-services.json
//   - mobile/ios/Runner/GoogleService-Info.plist
//
// Значения для **web** — пока placeholder. Чтобы включить web push:
//   1. Firebase Console → Project Settings → General → Your apps → Add app → Web
//   2. Скопировать `firebaseConfig` объект
//   3. Заменить placeholder в `web` ниже
//   4. Параллельно обновить `mobile/web/firebase-messaging-sw.js` теми же значениями
//   5. Получить VAPID key: Cloud Messaging → Web Push certificates → Generate key pair
//   6. Запускать flutter с `--dart-define=PUSH_VAPID_KEY=<vapid>`
//
// Этот файл создан вручную (без `flutterfire configure`) — при перегенерации
// CLI-tool перезапишет его, и значения web можно будет получить автоматически.

import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      return web;
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
        return ios;
      default:
        return web;
    }
  }

  /// Web — пока **placeholder**. Заменить когда добавим Web app в Firebase Console.
  static const FirebaseOptions web = FirebaseOptions(
    apiKey: 'PLACEHOLDER',
    appId: 'PLACEHOLDER',
    messagingSenderId: '727434965766',
    projectId: 'bizchat-4d11d',
    authDomain: 'bizchat-4d11d.firebaseapp.com',
    storageBucket: 'bizchat-4d11d.firebasestorage.app',
  );

  /// Android — реальные значения из `google-services.json`.
  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyCPJoEW5tFHbNcX6BPSkZf_wdA5pYu4xrk',
    appId: '1:727434965766:android:59eb3a8d2ee518f4a72487',
    messagingSenderId: '727434965766',
    projectId: 'bizchat-4d11d',
    storageBucket: 'bizchat-4d11d.firebasestorage.app',
  );

  /// iOS — реальные значения из `GoogleService-Info.plist`.
  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: 'AIzaSyD0ZsXY26WpF1A8lyPkUGJSWOs2QZrJNDg',
    appId: '1:727434965766:ios:c8f215385242dfbda72487',
    messagingSenderId: '727434965766',
    projectId: 'bizchat-4d11d',
    storageBucket: 'bizchat-4d11d.firebasestorage.app',
    iosBundleId: 'app.bizchat',
  );

  /// Per-platform проверка: считаем конфиг настроенным, если у текущей
  /// платформы apiKey не placeholder. На Android и iOS вернёт `true`
  /// (ключи реальные), на web — `false` пока не добавлен Web app в Firebase.
  static bool get isConfigured => currentPlatform.apiKey != 'PLACEHOLDER';
}
