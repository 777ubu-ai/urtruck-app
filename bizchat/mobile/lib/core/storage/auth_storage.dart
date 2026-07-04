import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Хранилище JWT-токенов в зашифрованном keychain/keystore.
/// НЕ используем SharedPreferences для токенов — это требование безопасности.
class AuthStorage {
  AuthStorage._();
  static final AuthStorage instance = AuthStorage._();

  static const _keyAccess = 'bizchat.auth.access_token';
  static const _keyRefresh = 'bizchat.auth.refresh_token';
  static const _keyUserId = 'bizchat.auth.user_id';
  static const _keyUserType = 'bizchat.auth.user_type';
  static const _keyOnboardingDone = 'bizchat.app.onboarding_done';
  static const _keyThemeMode = 'bizchat.app.theme_mode';

  // На Android новая версия flutter_secure_storage сама использует
  // безопасный шифр поверх SharedPreferences (старый encryptedSharedPreferences
  // от Jetpack Security deprecated). Не передаём опцию вообще.
  final _storage = const FlutterSecureStorage(
    iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
  );

  Future<void> saveSession({
    required String accessToken,
    required String refreshToken,
    required String userId,
    required String userType,
  }) async {
    await Future.wait([
      _storage.write(key: _keyAccess, value: accessToken),
      _storage.write(key: _keyRefresh, value: refreshToken),
      _storage.write(key: _keyUserId, value: userId),
      _storage.write(key: _keyUserType, value: userType),
    ]);
  }

  Future<String?> readAccessToken() => _safeRead(_keyAccess);
  Future<String?> readRefreshToken() => _safeRead(_keyRefresh);
  Future<String?> readUserId() => _safeRead(_keyUserId);
  Future<String?> readUserType() => _safeRead(_keyUserType);

  /// Чтение, устойчивое к коррапту хранилища.
  /// На web `flutter_secure_storage` иногда кидает `OperationError` из Web Crypto,
  /// если IndexedDB содержит данные, зашифрованные предыдущей парой ключей.
  /// В этом случае единственное, что можно сделать — очистить storage и
  /// продолжить как «нет сессии», иначе приложение зависает на белом экране.
  Future<String?> _safeRead(String key) async {
    try {
      return await _storage.read(key: key);
    } catch (_) {
      // Сбрасываем всё хранилище — повторное чтение тоже упадёт.
      try {
        await _storage.deleteAll();
      } catch (_) {/* игнорируем — storage уже в неконсистентном состоянии */}
      return null;
    }
  }

  Future<bool> hasSession() async {
    final token = await readAccessToken();
    return token != null && token.isNotEmpty;
  }

  /// Onboarding-флаг — показываем туториал только один раз.
  /// Хранится в том же secure storage, чтобы не тащить SharedPreferences.
  Future<bool> isOnboardingCompleted() async {
    final v = await _safeRead(_keyOnboardingDone);
    return v == '1';
  }

  Future<void> markOnboardingCompleted() async {
    try {
      await _storage.write(key: _keyOnboardingDone, value: '1');
    } catch (_) {/* best-effort, не блокируем переход */}
  }

  /// Режим темы: 'light' | 'dark' | 'system'. null = не выбрано юзером.
  Future<String?> readThemeMode() => _safeRead(_keyThemeMode);
  Future<void> saveThemeMode(String mode) async {
    try {
      await _storage.write(key: _keyThemeMode, value: mode);
    } catch (_) {/* best-effort */}
  }

  /// История поиска — последние 10 уникальных запросов через `|` separator.
  static const _keySearchHistory = 'bizchat.app.search_history';
  static const _maxSearchHistory = 10;

  Future<List<String>> readSearchHistory() async {
    final raw = await _safeRead(_keySearchHistory);
    if (raw == null || raw.isEmpty) return const [];
    return raw.split('|').where((s) => s.isNotEmpty).toList();
  }

  Future<void> addSearchHistory(String query) async {
    final q = query.trim();
    if (q.isEmpty) return;
    try {
      final existing = await readSearchHistory();
      // Если уже есть — перенесём в начало
      existing.removeWhere((s) => s == q);
      existing.insert(0, q);
      final trimmed = existing.take(_maxSearchHistory).toList();
      await _storage.write(
        key: _keySearchHistory,
        value: trimmed.join('|'),
      );
    } catch (_) {/* best-effort */}
  }

  Future<void> clearSearchHistory() async {
    try {
      await _storage.delete(key: _keySearchHistory);
    } catch (_) {/* best-effort */}
  }

  Future<void> clear() async {
    try {
      await _storage.deleteAll();
    } catch (_) {/* storage сломан — нечего чистить */}
  }
}
