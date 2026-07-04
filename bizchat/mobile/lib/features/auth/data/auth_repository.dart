import 'package:dio/dio.dart';
import '../../../core/api/api_client.dart';
import '../../../core/realtime/realtime_service.dart';
import '../../../core/storage/auth_storage.dart';
import '../../push/services/push_service.dart';

/// Результат успешной верификации.
class AuthResult {
  AuthResult({
    required this.userId,
    required this.userType,
    required this.isNew,
    required this.accessToken,
    required this.refreshToken,
  });

  final String userId;
  final String userType;
  final bool isNew;
  final String accessToken;
  final String refreshToken;
}

/// Исключение верификации — несёт user-friendly сообщение на русском.
class AuthException implements Exception {
  AuthException(this.message);
  final String message;
  @override
  String toString() => message;
}

class AuthRepository {
  AuthRepository({ApiClient? api, AuthStorage? storage})
      : _api = api ?? ApiClient.instance,
        _storage = storage ?? AuthStorage.instance;

  final ApiClient _api;
  final AuthStorage _storage;

  /// POST /auth/sms/send
  Future<void> sendSmsCode(String phone) async {
    try {
      final res = await _api.dio.post(
        '/auth/sms/send',
        data: {'phone': phone},
      );
      if (res.statusCode != 200) {
        throw AuthException(_extractError(res.data, 'Не удалось отправить SMS'));
      }
    } on DioException catch (e) {
      throw AuthException(_dioErrorToRu(e));
    }
  }

  /// POST /auth/sms/verify → сохраняет сессию в Keychain.
  Future<AuthResult> verifySmsCode({
    required String phone,
    required String code,
    String? type, // 'buyer' | 'factory' — только при первой регистрации
    String? countryCode,
    String? city,
  }) async {
    try {
      final res = await _api.dio.post(
        '/auth/sms/verify',
        data: {
          'phone': phone,
          'code': code,
          if (type != null) 'type': type,
          if (countryCode != null) 'countryCode': countryCode,
          if (city != null) 'city': city,
        },
      );

      if (res.statusCode != 200) {
        throw AuthException(_extractError(res.data, 'Неверный код'));
      }

      final data = res.data as Map<String, dynamic>;
      final user = data['user'] as Map<String, dynamic>;
      final tokens = data['tokens'] as Map<String, dynamic>;

      final result = AuthResult(
        userId: user['id'] as String,
        userType: user['type'] as String,
        isNew: user['isNew'] as bool? ?? false,
        accessToken: tokens['accessToken'] as String,
        refreshToken: tokens['refreshToken'] as String,
      );

      await _storage.saveSession(
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        userId: result.userId,
        userType: result.userType,
      );

      // Поднимаем WebSocket с новым токеном для real-time обновлений
      // (переконнект если старое соединение осталось с протухшим токеном).
      await RealtimeService.instance.reconnect();

      // Регистрируем FCM-токен для нового юзера. No-op если Firebase
      // не настроен или permission denied. Не блокируем UI.
      // ignore: unawaited_futures
      PushService.instance.activateForUser();

      return result;
    } on DioException catch (e) {
      throw AuthException(_dioErrorToRu(e));
    }
  }

  Future<void> logout() async {
    // Снимаем FCM-токен с бэка ДО clear() — иначе auth-интерсептор
    // не подложит токен в DELETE-запрос.
    await PushService.instance.deactivate();
    await RealtimeService.instance.disconnect();
    await _storage.clear();
  }

  // === helpers ===

  String _extractError(dynamic data, String fallback) {
    if (data is Map<String, dynamic>) {
      final msg = data['message'];
      if (msg is String) return msg;
      if (msg is List && msg.isNotEmpty) return msg.join(', ');
    }
    return fallback;
  }

  String _dioErrorToRu(DioException e) {
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return 'Сервер не отвечает. Проверь подключение.';
      case DioExceptionType.connectionError:
        return 'Нет соединения с сервером. Проверь интернет.';
      case DioExceptionType.badResponse:
        return _extractError(e.response?.data, 'Ошибка сервера');
      default:
        return 'Неизвестная ошибка: ${e.message}';
    }
  }
}
