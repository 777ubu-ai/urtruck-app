import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../storage/auth_storage.dart';

/// HTTP-клиент для общения с backend SourceHub.
/// Все запросы идут через него, нигде больше http не инстанцируется.
///
/// Base URL определяется автоматически:
///   - Web (Chrome) → http://localhost:3000
///   - iOS симулятор → http://localhost:3000
///   - Android эмулятор → http://10.0.2.2:3000 (специальный адрес для эмулятора)
///   - физическое устройство → нужно задать APP_API_URL через --dart-define
///     Пример: flutter run --dart-define=APP_API_URL=http://192.168.1.100:3000
class ApiClient {
  ApiClient._(this._dio);

  final Dio _dio;

  static ApiClient? _instance;

  static ApiClient get instance {
    _instance ??= _create();
    return _instance!;
  }

  static ApiClient _create() {
    const overrideUrl = String.fromEnvironment('APP_API_URL');

    final baseUrl = overrideUrl.isNotEmpty
        ? overrideUrl
        : (!kIsWeb && defaultTargetPlatform == TargetPlatform.android
            ? 'http://10.0.2.2:3000'
            : 'http://localhost:3000');

    final dio = Dio(BaseOptions(
      baseUrl: '$baseUrl/api/v1',
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 20),
      sendTimeout: const Duration(seconds: 10),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      // Не кидаем исключение на 4xx — обрабатываем вручную, чтобы UI
      // мог показать понятное сообщение вместо "Dio error".
      validateStatus: (status) => status != null && status < 500,
    ));

    // Auth-интерсептор: автоматом подкладывает Bearer-токен в каждый запрос,
    // если он есть в AuthStorage. Так репозитории не дублируют логику чтения
    // токена в каждом методе. Если токена нет — заголовок просто не добавляется.
    //
    // Также обрабатывает 401: один раз пытается refresh access token через
    // /auth/refresh, при успехе повторяет оригинальный запрос. При провале
    // refresh — чистит storage (юзер увидит экран логина при следующем
    // открытии auth-зависимого экрана) и оставляет оригинальный 401 response.
    //
    // Защита от рекурсии: запрос с флагом `_skipAuthRetry` пропускает
    // интерцептор (используется внутри самого refresh-вызова).
    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        try {
          final token = await AuthStorage.instance.readAccessToken();
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
        } catch (_) {
          // Storage сломан — пропускаем без авторизации, пусть бэк решит.
        }
        handler.next(options);
      },
      onResponse: (response, handler) async {
        // Не 401 → пропускаем как есть.
        if (response.statusCode != 401) {
          return handler.next(response);
        }
        // Уже была попытка retry / запрос самого refresh / запрос auth/sms —
        // не зацикливаем.
        final path = response.requestOptions.path;
        if (response.requestOptions.extra['_skipAuthRetry'] == true ||
            path.startsWith('/auth/')) {
          return handler.next(response);
        }
        try {
          final refreshToken = await AuthStorage.instance.readRefreshToken();
          if (refreshToken == null || refreshToken.isEmpty) {
            return handler.next(response);
          }
          // Один прямой запрос к refresh — без интерцептора (чтобы не подкладывал
          // протухший access token и не словил рекурсию).
          final refreshDio = Dio(BaseOptions(
            baseUrl: dio.options.baseUrl,
            headers: const {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            connectTimeout: const Duration(seconds: 10),
            receiveTimeout: const Duration(seconds: 10),
          ));
          final refreshRes = await refreshDio.post(
            '/auth/refresh',
            data: {'refreshToken': refreshToken},
          );
          if (refreshRes.statusCode != 200) {
            // Refresh не прошёл — чистим storage и оставляем 401.
            try {
              await AuthStorage.instance.clear();
            } catch (_) {/* ignore */}
            return handler.next(response);
          }
          final tokens = (refreshRes.data as Map).cast<String, dynamic>();
          final newAccess = tokens['accessToken'] as String;
          final newRefresh = tokens['refreshToken'] as String;
          // Сохраняем новые токены. userId/userType в storage не трогаем.
          final userId = await AuthStorage.instance.readUserId();
          final userType = await AuthStorage.instance.readUserType();
          if (userId != null && userType != null) {
            await AuthStorage.instance.saveSession(
              accessToken: newAccess,
              refreshToken: newRefresh,
              userId: userId,
              userType: userType,
            );
          }
          // Повторяем оригинальный запрос с новым токеном. Ставим флаг
          // _skipAuthRetry чтобы при повторном 401 не зациклиться.
          final original = response.requestOptions;
          original.headers['Authorization'] = 'Bearer $newAccess';
          original.extra['_skipAuthRetry'] = true;
          final retryResponse = await dio.fetch(original);
          return handler.resolve(retryResponse);
        } catch (_) {
          // Что угодно сломалось при refresh — оставляем оригинальный 401.
          try {
            await AuthStorage.instance.clear();
          } catch (_) {/* ignore */}
          return handler.next(response);
        }
      },
    ));

    dio.interceptors.add(LogInterceptor(
      requestBody: true,
      responseBody: true,
      error: true,
      logPrint: (obj) {
        // В dev удобно видеть в консоли, в проде это можно отключить.
        // ignore: avoid_print
        print('[API] $obj');
      },
    ));

    return ApiClient._(dio);
  }

  Dio get dio => _dio;

  /// Префикс для статики — baseUrl без суффикса `/api/v1`.
  /// Используется для раскрытия относительных URL медиа (`/uploads/xxx.jpg`).
  String get staticBaseUrl => _dio.options.baseUrl.replaceAll('/api/v1', '');

  /// Превращает относительный URL медиа в абсолютный. Если URL уже абсолютный
  /// (начинается с `http`), возвращает как есть — это поддерживает и
  /// загруженные на наш сервер файлы (`/uploads/xxx.jpg`), и внешние
  /// картинки (например с `picsum.photos` из seed-данных).
  static String resolveMediaUrl(String url) {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    // Относительный путь — дополняем до абсолютного.
    return '${instance.staticBaseUrl}$url';
  }
}
