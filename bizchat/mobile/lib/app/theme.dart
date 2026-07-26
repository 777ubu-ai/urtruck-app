import 'package:flutter/material.dart';

/// Темы Biz Chat. Обе обязательны с первого дня
/// (Blueprint §22 — байеры СНГ работают ночью).
///
/// Направление дизайна — Material 3 Expressive (тренд 2025–2026):
/// выразительная типографика, мягкие крупные скругления, спокойные
/// tonal-поверхности, единый плавный motion на всех платформах.
class BizChatTheme {
  BizChatTheme._();

  static const _brandSeed = Color(0xFF0B66FF); // фирменный синий Biz Chat

  // Единая шкала скруглений — крупнее, чем дефолт M3 (тренд «soft UI»).
  static const double rSm = 14;
  static const double rMd = 18;
  static const double rLg = 24;
  static const double rXl = 28;

  /// Светлая тема: чистый белый фон и почти чёрный текст.
  ///
  /// ВАЖНО: генерируемая из seed-цвета палитра тонирует ВСЕ поверхности в
  /// сиренево-серый — из-за этого интерфейс выглядел блёклым и «расплывчатым».
  /// Поэтому поверхности переопределяем на нейтральные: контент и фото
  /// становятся главными, а фирменный синий остаётся акцентом кнопок.
  static ThemeData light() {
    final scheme = ColorScheme.fromSeed(
      seedColor: _brandSeed,
      brightness: Brightness.light,
    ).copyWith(
      surface: const Color(0xFFFFFFFF),
      onSurface: const Color(0xFF0A0A0A),
      surfaceContainerLowest: const Color(0xFFFFFFFF),
      surfaceContainerLow: const Color(0xFFFFFFFF),
      surfaceContainer: const Color(0xFFF7F7F7),
      surfaceContainerHigh: const Color(0xFFF2F2F2),
      surfaceContainerHighest: const Color(0xFFEFEFEF),
      onSurfaceVariant: const Color(0xFF6B6B6B),
      outlineVariant: const Color(0xFFE0E0E0),
    );
    return _base(scheme);
  }

  /// Тёмная тема: глубокий чёрный, как в ночных режимах соцсетей.
  static ThemeData dark() {
    final scheme = ColorScheme.fromSeed(
      seedColor: _brandSeed,
      brightness: Brightness.dark,
    ).copyWith(
      surface: const Color(0xFF000000),
      onSurface: const Color(0xFFFAFAFA),
      surfaceContainerLowest: const Color(0xFF000000),
      surfaceContainerLow: const Color(0xFF0A0A0A),
      surfaceContainer: const Color(0xFF141414),
      surfaceContainerHigh: const Color(0xFF1C1C1C),
      surfaceContainerHighest: const Color(0xFF242424),
      onSurfaceVariant: const Color(0xFFA0A0A0),
      outlineVariant: const Color(0xFF2E2E2E),
    );
    return _base(scheme);
  }

  static ThemeData _base(ColorScheme scheme) {
    final isDark = scheme.brightness == Brightness.dark;
    return ThemeData(
      colorScheme: scheme,
      useMaterial3: true,
      fontFamily: null, // системный шрифт — поддержит кириллицу/иероглифы
      scaffoldBackgroundColor: scheme.surface,
      splashFactory: InkSparkle.splashFactory, // «искристый» M3-ripple
      // Выразительная типографика: крупнее и жирнее заголовки, плотный трекинг.
      textTheme: _expressiveText(scheme),
      // Единый плавный fade+slide на всех платформах вместо платформенных.
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: _FadeThroughTransitionBuilder(),
          TargetPlatform.iOS: _FadeThroughTransitionBuilder(),
          TargetPlatform.linux: _FadeThroughTransitionBuilder(),
          TargetPlatform.macOS: _FadeThroughTransitionBuilder(),
          TargetPlatform.windows: _FadeThroughTransitionBuilder(),
        },
      ),
      appBarTheme: AppBarTheme(
        centerTitle: true,
        elevation: 0,
        scrolledUnderElevation: 0,
        surfaceTintColor: Colors.transparent,
        backgroundColor: scheme.surface,
        foregroundColor: scheme.onSurface,
        titleTextStyle: TextStyle(
          color: scheme.onSurface,
          fontSize: 19,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.3,
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: scheme.surfaceContainerHighest,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(rSm),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(rSm),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(rSm),
          borderSide: BorderSide(color: scheme.primary, width: 1.5),
        ),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(double.infinity, 54),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(rMd),
          ),
          textStyle: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.1,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(double.infinity, 52),
          side: BorderSide(color: scheme.outlineVariant),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(rMd),
          ),
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          minimumSize: const Size(double.infinity, 44),
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
        ),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        color: scheme.surfaceContainerLow,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(rLg),
        ),
        margin: EdgeInsets.zero,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: scheme.surfaceContainerHighest,
        selectedColor: scheme.primary,
        side: BorderSide.none,
        labelStyle: TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: scheme.onSurface,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(rXl),
        ),
      ),
      // SnackBar в трендовом floating-стиле с крупным скруглением.
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: scheme.inverseSurface,
        contentTextStyle: TextStyle(
          color: scheme.onInverseSurface,
          fontWeight: FontWeight.w500,
        ),
        actionTextColor: scheme.inversePrimary,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(rSm),
        ),
        insetPadding: const EdgeInsets.all(16),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: scheme.surfaceContainerHigh,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(rLg),
        ),
        titleTextStyle: TextStyle(
          fontSize: 19,
          fontWeight: FontWeight.w700,
          color: scheme.onSurface,
        ),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: scheme.surfaceContainerLow,
        surfaceTintColor: Colors.transparent,
        showDragHandle: true,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(rXl)),
        ),
      ),
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: scheme.surface,
        selectedItemColor: scheme.primary,
        unselectedItemColor: scheme.onSurfaceVariant,
        type: BottomNavigationBarType.fixed,
        elevation: 0,
        showSelectedLabels: true,
        showUnselectedLabels: true,
        selectedLabelStyle:
            const TextStyle(fontWeight: FontWeight.w700, fontSize: 12),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: scheme.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        height: 64,
        indicatorColor: scheme.primaryContainer,
        labelTextStyle: WidgetStateProperty.all(
          const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
        ),
      ),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        elevation: 1,
        highlightElevation: 2,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(rMd),
        ),
      ),
      dividerTheme: DividerThemeData(
        color: scheme.outlineVariant.withValues(alpha: isDark ? 0.4 : 0.6),
        thickness: 0.5,
        space: 0.5,
      ),
    );
  }

  /// Выразительная типографика в духе M3 Expressive: крупные bold-заголовки
  /// с плотным трекингом, читаемый body. Строится поверх дефолтной шкалы,
  /// чтобы наследовать корректные цвета под тему.
  static TextTheme _expressiveText(ColorScheme scheme) {
    const tight = -0.5;
    return Typography.material2021(colorScheme: scheme)
        .black
        .apply(
          bodyColor: scheme.onSurface,
          displayColor: scheme.onSurface,
        )
        .copyWith(
          headlineLarge: TextStyle(
            fontSize: 30,
            fontWeight: FontWeight.w800,
            letterSpacing: tight,
            color: scheme.onSurface,
          ),
          headlineMedium: TextStyle(
            fontSize: 25,
            fontWeight: FontWeight.w700,
            letterSpacing: tight,
            color: scheme.onSurface,
          ),
          titleLarge: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w700,
            letterSpacing: -0.3,
            color: scheme.onSurface,
          ),
          titleMedium: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
            color: scheme.onSurface,
          ),
        );
  }
}

/// Кастомный transition builder для PageTransitionsTheme — fade + slight slide.
/// Реализует [PageTransitionsBuilder.buildTransitions], применяется глобально
/// через pageTransitionsTheme в [BizChatTheme._base].
class _FadeThroughTransitionBuilder extends PageTransitionsBuilder {
  const _FadeThroughTransitionBuilder();

  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    final curved = CurvedAnimation(
      parent: animation,
      curve: Curves.easeOutCubic,
      reverseCurve: Curves.easeInCubic,
    );
    return FadeTransition(
      opacity: curved,
      child: SlideTransition(
        position: Tween<Offset>(
          begin: const Offset(0, 0.04),
          end: Offset.zero,
        ).animate(curved),
        child: child,
      ),
    );
  }
}
