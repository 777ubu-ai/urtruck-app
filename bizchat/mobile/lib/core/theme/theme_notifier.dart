import 'package:flutter/material.dart';
import '../storage/auth_storage.dart';

/// Singleton-notifier для режима темы (светлая/тёмная/системная).
/// Используется в MaterialApp через ValueListenableBuilder для переключения
/// без перезапуска.
///
/// По умолчанию — `system` (следует настройке ОС). Пользователь может
/// переопределить в Settings → тёмная или светлая принудительно. Значение
/// сохраняется в AuthStorage между сессиями.
class ThemeNotifier extends ValueNotifier<ThemeMode> {
  ThemeNotifier._() : super(ThemeMode.system) {
    _load();
  }

  static final ThemeNotifier instance = ThemeNotifier._();

  Future<void> _load() async {
    try {
      final saved = await AuthStorage.instance.readThemeMode();
      if (saved != null) {
        value = _parseMode(saved);
      }
    } catch (_) {/* storage не готов — остаёмся на system */}
  }

  static ThemeMode _parseMode(String s) {
    switch (s) {
      case 'light':
        return ThemeMode.light;
      case 'dark':
        return ThemeMode.dark;
      case 'system':
      default:
        return ThemeMode.system;
    }
  }

  static String _modeToString(ThemeMode m) {
    switch (m) {
      case ThemeMode.light:
        return 'light';
      case ThemeMode.dark:
        return 'dark';
      case ThemeMode.system:
        return 'system';
    }
  }

  Future<void> setMode(ThemeMode mode) async {
    if (value == mode) return;
    value = mode;
    try {
      await AuthStorage.instance.saveThemeMode(_modeToString(mode));
    } catch (_) {/* best-effort */}
  }
}
