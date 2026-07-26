import 'package:flutter/material.dart';

/// Бейдж доверия завода.
///
/// Раньше везде печаталось «Trust Score: 0» — для нового завода это выглядело
/// сломанным и мёртвым. Теперь:
///   - score == 0 (новый завод)  → нейтральное «Новый» (без цифры)
///   - verified                  → синяя галочка «Проверен»
///   - score >= 70               → зелёный/янтарный бейдж с цифрой
///   - иначе                     → спокойный серый бейдж с цифрой
///
/// Компактный pill: цветная подложка + иконка + текст.
class TrustBadge extends StatelessWidget {
  const TrustBadge({
    super.key,
    required this.score,
    this.verified = false,
    this.compact = true,
  });

  final int score;
  final bool verified;

  /// compact — маленький вариант для ленты; false — крупнее для профиля.
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    late final Color fg;
    late final Color bg;
    late final IconData icon;
    late final String label;

    if (verified) {
      fg = const Color(0xFF0B66FF);
      bg = const Color(0xFF0B66FF).withValues(alpha: 0.12);
      icon = Icons.verified_rounded;
      label = 'Проверен';
    } else if (score <= 0) {
      // Новый завод: не показываем ноль — показываем статус.
      fg = scheme.onSurfaceVariant;
      bg = scheme.surfaceContainerHighest;
      icon = Icons.fiber_new_rounded;
      label = 'Новый';
    } else if (score >= 90) {
      fg = const Color(0xFF0F9D58);
      bg = const Color(0xFF0F9D58).withValues(alpha: 0.12);
      icon = Icons.workspace_premium_rounded;
      label = 'Топ · $score';
    } else if (score >= 70) {
      fg = const Color(0xFF1E8E3E);
      bg = const Color(0xFF1E8E3E).withValues(alpha: 0.12);
      icon = Icons.shield_rounded;
      label = 'Надёжный · $score';
    } else if (score >= 40) {
      fg = const Color(0xFFB26A00);
      bg = const Color(0xFFF9AB00).withValues(alpha: 0.15);
      icon = Icons.trending_up_rounded;
      label = 'Рейтинг $score';
    } else {
      fg = scheme.onSurfaceVariant;
      bg = scheme.surfaceContainerHighest;
      icon = Icons.remove_red_eye_outlined;
      label = 'Рейтинг $score';
    }

    final double fontSize = compact ? 11.5 : 13;
    final double iconSize = compact ? 13 : 16;

    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: compact ? 8 : 10,
        vertical: compact ? 3 : 5,
      ),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(100),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: iconSize, color: fg),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(
              fontSize: fontSize,
              fontWeight: FontWeight.w700,
              color: fg,
              letterSpacing: -0.1,
            ),
          ),
        ],
      ),
    );
  }
}

/// Круглый аватар завода с фирменным градиентным кольцом (как в Instagram).
/// Если фото нет — показывает первую букву названия на градиенте, а не
/// плоский серый кружок.
class FactoryAvatar extends StatelessWidget {
  const FactoryAvatar({
    super.key,
    required this.name,
    this.imageUrl,
    this.size = 44,
    this.showRing = true,
  });

  final String name;
  final String? imageUrl;
  final double size;
  final bool showRing;

  static const _gradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF0B66FF), Color(0xFF00C2FF)],
  );

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final letter = name.trim().isNotEmpty ? name.trim()[0].toUpperCase() : '?';
    final inner = size - (showRing ? 5 : 0);

    final avatar = Container(
      width: inner,
      height: inner,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: imageUrl == null || imageUrl!.isEmpty ? _gradient : null,
        color: scheme.surface,
        image: imageUrl != null && imageUrl!.isNotEmpty
            ? DecorationImage(
                image: NetworkImage(imageUrl!),
                fit: BoxFit.cover,
              )
            : null,
      ),
      alignment: Alignment.center,
      child: imageUrl == null || imageUrl!.isEmpty
          ? Text(
              letter,
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w800,
                fontSize: inner * 0.42,
              ),
            )
          : null,
    );

    if (!showRing) return avatar;

    return Container(
      width: size,
      height: size,
      padding: const EdgeInsets.all(2),
      decoration: const BoxDecoration(
        shape: BoxShape.circle,
        gradient: _gradient,
      ),
      child: Container(
        padding: const EdgeInsets.all(1.5),
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: Theme.of(context).colorScheme.surface,
        ),
        child: avatar,
      ),
    );
  }
}
