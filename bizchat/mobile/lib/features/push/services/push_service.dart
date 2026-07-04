import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import '../../../firebase_options.dart';
import '../data/push_repository.dart';

/// Высокоуровневый сервис push-уведомлений на клиенте.
///
/// Singleton. Использование:
///   1. В `main()` — `await PushService.instance.initFirebase()` (один раз)
///   2. После успешного логина — `await PushService.instance.activateForUser()`
///   3. При logout — `await PushService.instance.deactivate()`
///
/// **Graceful degradation:**
/// - Если `firebase_options.dart` не настроен (apiKey == 'PLACEHOLDER') —
///   `initFirebase()` выходит без падения, всё остальное no-op.
/// - Если permission denied — токен не запрашивается, no-op.
/// - Если бэк не отвечает — registerToken молча игнорирует ошибку.
///
/// **VAPID key для web:** установить через [setWebVapidKey] до вызова
/// `activateForUser()`. Без VAPID FCM на web вернёт `null`-токен.
class PushService {
  PushService._();
  static final PushService instance = PushService._();

  final PushRepository _repo = PushRepository();

  bool _firebaseInitialized = false;
  bool _enabled = false;
  String? _currentToken;
  String? _vapidKey;

  bool get isEnabled => _enabled;
  String? get currentToken => _currentToken;

  /// VAPID key для web push. Получить:
  /// Firebase Console → Project Settings → Cloud Messaging →
  /// Web configuration → Web Push certificates → Generate key pair.
  /// Можно зашить через --dart-define=PUSH_VAPID_KEY=... или вызвать сеттер.
  void setWebVapidKey(String key) {
    _vapidKey = key;
  }

  /// Инициализация Firebase. Вызывать один раз в `main()` ДО runApp.
  /// Безопасна к повторному вызову. Не падает если конфиг placeholder.
  Future<void> initFirebase() async {
    if (_firebaseInitialized) return;
    if (!DefaultFirebaseOptions.isConfigured) {
      debugPrint(
        '[PushService] Firebase not configured (placeholder firebase_options.dart). '
        'Run `flutterfire configure` to enable push notifications.',
      );
      return;
    }
    try {
      await Firebase.initializeApp(
        options: DefaultFirebaseOptions.currentPlatform,
      );
      _firebaseInitialized = true;
      debugPrint('[PushService] Firebase initialized');
    } catch (e) {
      debugPrint('[PushService] Firebase init failed: $e');
    }
  }

  /// Активировать push для текущего залогиненного юзера:
  ///   1. Спросить permission
  ///   2. Получить FCM-токен
  ///   3. Зарегистрировать токен на бэке
  ///   4. Подписаться на onMessage / onTokenRefresh
  ///
  /// Вызывать после успешного логина (когда auth-токен уже в AuthStorage —
  /// иначе бэк вернёт 401 на register-token и мы тихо пропустим).
  Future<void> activateForUser({String language = 'ru'}) async {
    if (!_firebaseInitialized) {
      debugPrint('[PushService] activateForUser skipped — Firebase not initialized');
      return;
    }
    try {
      final messaging = FirebaseMessaging.instance;

      // Запрашиваем permission. На Android < 13 это no-op (всегда granted),
      // на iOS/web покажет нативный диалог.
      final settings = await messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
      if (settings.authorizationStatus == AuthorizationStatus.denied) {
        debugPrint('[PushService] permission denied — push disabled');
        return;
      }

      // Получаем токен. Для web нужен VAPID key.
      final token = kIsWeb
          ? await messaging.getToken(vapidKey: _vapidKey)
          : await messaging.getToken();

      if (token == null || token.isEmpty) {
        debugPrint(
          '[PushService] FCM token is null. '
          '${kIsWeb ? "Did you set VAPID key via setWebVapidKey()?" : ""}',
        );
        return;
      }

      _currentToken = token;
      debugPrint('[PushService] FCM token: ${token.substring(0, 16)}…');

      await _repo.registerToken(
        token: token,
        platform: _detectPlatform(),
        language: language,
      );

      // Listener на refresh — токен может ротироваться, бэк надо обновить.
      messaging.onTokenRefresh.listen((newToken) async {
        _currentToken = newToken;
        await _repo.registerToken(
          token: newToken,
          platform: _detectPlatform(),
          language: language,
        );
      });

      _enabled = true;
    } catch (e) {
      debugPrint('[PushService] activateForUser failed: $e');
    }
  }

  /// Дезактивация при logout. Снимает токен с бэка, чтобы пуши больше не
  /// приходили на это устройство для прежнего юзера.
  Future<void> deactivate() async {
    if (!_enabled) return;
    final token = _currentToken;
    _enabled = false;
    _currentToken = null;
    if (token != null) {
      await _repo.unregisterToken(token);
    }
    try {
      await FirebaseMessaging.instance.deleteToken();
    } catch (e) {
      debugPrint('[PushService] deleteToken failed: $e');
    }
  }

  String _detectPlatform() {
    if (kIsWeb) return 'web';
    if (defaultTargetPlatform == TargetPlatform.android) return 'android';
    if (defaultTargetPlatform == TargetPlatform.iOS) return 'ios';
    return 'web'; // fallback
  }
}
