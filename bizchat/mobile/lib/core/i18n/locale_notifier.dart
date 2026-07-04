import 'package:flutter/widgets.dart';

/// Singleton-noticer для текущей локали приложения. Используется в `MaterialApp`
/// через `ValueListenableBuilder`, чтобы переключение языка происходило без
/// перезапуска приложения.
///
/// Источник правды: `MyProfile.language` от бэка. После загрузки профиля
/// (loadMe / verifyCode / updateMe) `ProfileRepository` устанавливает значение
/// сюда. До первой загрузки профиля используется значение по умолчанию `ru`
/// (или системный язык если он один из supported).
///
/// Поддерживаемые языки: `ru`, `en`, `zh` (упрощённый китайский).
class LocaleNotifier extends ValueNotifier<Locale> {
  LocaleNotifier._() : super(_initialLocale());

  static final LocaleNotifier instance = LocaleNotifier._();

  /// Список поддерживаемых локалей. Должен совпадать с supportedLocales
  /// в MaterialApp и с набором ARB-файлов в lib/l10n/.
  static const supportedLocales = [
    Locale('en'),
    Locale('ru'),
    Locale('zh'),
  ];

  static Locale _initialLocale() {
    // Можно было бы спросить системный язык через PlatformDispatcher,
    // но на старте у нас нет контекста и Flutter сам делает fallback
    // через MaterialApp.localeResolutionCallback. Дефолт — русский,
    // потому что основная аудитория — байеры СНГ.
    return const Locale('ru');
  }

  /// Установить локаль из строки кода ('ru' / 'en' / 'zh'). Безопасно к
  /// неизвестным значениям — просто игнорирует.
  void setFromCode(String? code) {
    if (code == null || code.isEmpty) return;
    final normalized = code.toLowerCase();
    final match = supportedLocales.firstWhere(
      (l) => l.languageCode == normalized,
      orElse: () => value,
    );
    if (match.languageCode != value.languageCode) {
      value = match;
    }
  }
}
