import 'package:flutter/material.dart';

/// Простой shimmer-skeleton без сторонних пакетов. Используется как
/// placeholder вместо CircularProgressIndicator для loading-состояний
/// списков — даёт ощущение мгновенной загрузки и не «прыгает» layout
/// после прихода данных.
///
/// Не требует пакета `shimmer` — рисует анимированный градиент через
/// `AnimatedBuilder` поверх контейнера. На web быстрее чем шиммер,
/// потому что нет shader'а.
class SkeletonBox extends StatefulWidget {
  const SkeletonBox({
    super.key,
    this.width,
    this.height = 16,
    this.borderRadius = 8,
  });

  final double? width;
  final double height;
  final double borderRadius;

  @override
  State<SkeletonBox> createState() => _SkeletonBoxState();
}

class _SkeletonBoxState extends State<SkeletonBox>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1100),
    )..repeat();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final baseColor = scheme.surfaceContainerHighest;
    final highlightColor = scheme.surfaceContainerHigh;
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (_, __) {
        // Линейная интерполяция базового и highlight цветов туда-обратно.
        final t = (_ctrl.value < 0.5
                ? _ctrl.value * 2
                : (1 - _ctrl.value) * 2)
            .clamp(0.0, 1.0);
        return Container(
          width: widget.width,
          height: widget.height,
          decoration: BoxDecoration(
            color: Color.lerp(baseColor, highlightColor, t),
            borderRadius: BorderRadius.circular(widget.borderRadius),
          ),
        );
      },
    );
  }
}

/// Skeleton-карточка одного поста для ленты — крупное превью + 2 строки текста.
class PostCardSkeleton extends StatelessWidget {
  const PostCardSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
      child: Card(
        clipBehavior: Clip.antiAlias,
        margin: EdgeInsets.zero,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header (avatar + name + score)
            Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  const SkeletonBox(
                      width: 40, height: 40, borderRadius: 20),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: const [
                        SkeletonBox(width: 140, height: 14),
                        SizedBox(height: 6),
                        SkeletonBox(width: 80, height: 12),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            // Большое медиа
            const AspectRatio(
              aspectRatio: 1,
              child: SkeletonBox(borderRadius: 0),
            ),
            // Title + price
            const Padding(
              padding: EdgeInsets.fromLTRB(12, 12, 12, 4),
              child: SkeletonBox(width: double.infinity, height: 14),
            ),
            const Padding(
              padding: EdgeInsets.fromLTRB(12, 4, 12, 12),
              child: SkeletonBox(width: 120, height: 14),
            ),
          ],
        ),
      ),
    );
  }
}

/// Skeleton-tile для горизонтальных списков (search/hashtag/saves —
/// 80×80 thumbnail + 2 строки).
class CompactPostTileSkeleton extends StatelessWidget {
  const CompactPostTileSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SkeletonBox(width: 80, height: 80, borderRadius: 8),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: const [
                SkeletonBox(width: double.infinity, height: 14),
                SizedBox(height: 8),
                SkeletonBox(width: 120, height: 12),
                SizedBox(height: 8),
                SkeletonBox(width: 80, height: 14),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Список из N skeleton-карточек для loading-состояния ленты.
class FeedSkeletonList extends StatelessWidget {
  const FeedSkeletonList({super.key, this.itemCount = 4});
  final int itemCount;

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      itemCount: itemCount,
      itemBuilder: (_, __) => const PostCardSkeleton(),
    );
  }
}

/// Список compact-tile skeleton'ов (для поиска/хэштега/сохранений).
class CompactListSkeleton extends StatelessWidget {
  const CompactListSkeleton({super.key, this.itemCount = 8});
  final int itemCount;

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      itemCount: itemCount,
      separatorBuilder: (_, __) => const Divider(height: 1, indent: 104),
      itemBuilder: (_, __) => const CompactPostTileSkeleton(),
    );
  }
}
