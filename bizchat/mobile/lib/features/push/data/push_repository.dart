import 'package:dio/dio.dart';
import '../../../core/api/api_client.dart';

/// Тонкий клиент к /push эндпоинтам бэка. Все вызовы best-effort —
/// если бэк недоступен или вернул ошибку, мы логируем и не падаем.
class PushRepository {
  PushRepository({ApiClient? api}) : _api = api ?? ApiClient.instance;
  final ApiClient _api;

  /// POST /push/register-token — регистрирует FCM-токен текущего юзера.
  /// Бэк делает UPSERT по token, можно вызывать сколько угодно раз.
  Future<void> registerToken({
    required String token,
    required String platform,
    String? language,
  }) async {
    try {
      await _api.dio.post(
        '/push/register-token',
        data: {
          'token': token,
          'platform': platform,
          if (language != null) 'language': language,
        },
      );
    } on DioException catch (_) {
      // Тихо игнорируем — push best-effort. Если бэк недоступен, в следующий
      // запуск приложения снова попробуем зарегистрировать.
    }
  }

  /// DELETE /push/token/:token — отвязать токен от юзера.
  /// Вызывается при logout, чтобы юзер не получал пуши на устройстве,
  /// где он больше не залогинен.
  Future<void> unregisterToken(String token) async {
    try {
      await _api.dio.delete('/push/token/$token');
    } on DioException catch (_) {/* best-effort */}
  }
}
