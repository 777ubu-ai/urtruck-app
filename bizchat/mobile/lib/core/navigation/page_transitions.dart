import 'package:flutter/material.dart';

/// Кастомные page-transitions — fade + slight slide вместо дефолтного
/// `MaterialPageRoute` (который на iOS делает iOS-style swipe-back, а на
/// Android — простой OpenContainer). Даёт более «современный» feel
/// и одинаковое поведение на всех платформах.
///
/// Использование вместо `MaterialPageRoute(builder: (_) => Screen())`:
///   Navigator.push(context, fadeThroughRoute(const Screen()));
PageRoute<T> fadeThroughRoute<T>(Widget child) {
  return PageRouteBuilder<T>(
    pageBuilder: (_, __, ___) => child,
    transitionDuration: const Duration(milliseconds: 320),
    reverseTransitionDuration: const Duration(milliseconds: 240),
    transitionsBuilder: (_, animation, __, child) {
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
    },
  );
}

/// Slide-from-bottom transition — для модальных полноэкранных переходов
/// (например post_detail из ленты). Близко к iOS sheet-стилю.
PageRoute<T> slideUpRoute<T>(Widget child) {
  return PageRouteBuilder<T>(
    pageBuilder: (_, __, ___) => child,
    transitionDuration: const Duration(milliseconds: 360),
    reverseTransitionDuration: const Duration(milliseconds: 280),
    transitionsBuilder: (_, animation, __, child) {
      final curved = CurvedAnimation(
        parent: animation,
        curve: Curves.easeOutCubic,
        reverseCurve: Curves.easeInCubic,
      );
      return SlideTransition(
        position: Tween<Offset>(
          begin: const Offset(0, 0.15),
          end: Offset.zero,
        ).animate(curved),
        child: FadeTransition(
          opacity: curved,
          child: child,
        ),
      );
    },
  );
}
