import 'package:flutter/material.dart';
import '../../../core/currency/converted_price_text.dart';
import '../../../core/widgets/video_media_player.dart';
import '../../../l10n/app_localizations.dart';
import '../data/feed_repository.dart';
import 'comments_sheet.dart';
import 'post_detail_screen.dart';

/// TikTok-style вертикальный full-screen viewer для постов с видео.
///
/// Загружает `/posts/reels` (фильтр на posts с media.type == video).
/// Каждая страница `PageView.builder` — отдельный пост с видео на весь
/// экран и оверлей: завод, описание, цена, кнопки действий справа.
///
/// `PageView.builder` lazy-builds, и `keepAlive: false` означает что
/// невидимые видео автоматически dispose'ятся → освобождаем video
/// controllers (важно для performance).
///
/// При смене страницы триггерим load next page если близко к концу.
class ReelsScreen extends StatefulWidget {
  const ReelsScreen({super.key});

  @override
  State<ReelsScreen> createState() => _ReelsScreenState();
}

class _ReelsScreenState extends State<ReelsScreen> {
  final _repo = FeedRepository();
  final PageController _pageController = PageController();
  final List<FeedPost> _items = [];
  String? _nextCursor;
  bool _hasMore = true;
  bool _loading = false;
  String? _error;
  int _currentIndex = 0;

  @override
  void initState() {
    super.initState();
    _loadMore();
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  Future<void> _loadMore() async {
    if (_loading || !_hasMore) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final page = await _repo.loadReels(cursor: _nextCursor);
      if (!mounted) return;
      setState(() {
        _items.addAll(page.items);
        _nextCursor = page.nextCursor;
        _hasMore = page.hasMore;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  void _onPageChanged(int idx) {
    setState(() => _currentIndex = idx);
    // Подгружаем следующую страницу когда осталось 3 или меньше
    if (idx >= _items.length - 3 && _hasMore && !_loading) {
      _loadMore();
    }
  }

  /// Найти первое video media в посте.
  String? _firstVideoUrl(FeedPost post) {
    for (final m in post.media) {
      if (m['type'] == 'video') {
        return m['url'] as String?;
      }
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    return Scaffold(
      backgroundColor: Colors.black,
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Text(
          l.reelsTitle,
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w700,
            shadows: [Shadow(color: Colors.black54, blurRadius: 4)],
          ),
        ),
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    final l = AppLocalizations.of(context)!;
    if (_items.isEmpty && _loading) {
      return const Center(child: CircularProgressIndicator(color: Colors.white));
    }
    if (_items.isEmpty && _error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, size: 64, color: Colors.white54),
              const SizedBox(height: 12),
              Text(_error!,
                  style: const TextStyle(color: Colors.white),
                  textAlign: TextAlign.center),
              const SizedBox(height: 12),
              FilledButton.tonal(
                onPressed: _loadMore,
                child: Text(l.commonRetry),
              ),
            ],
          ),
        ),
      );
    }
    if (_items.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.video_library_outlined,
                  size: 96, color: Colors.white54),
              const SizedBox(height: 16),
              Text(
                l.reelsEmptyTitle,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                l.reelsEmptySubtitle,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white70),
              ),
            ],
          ),
        ),
      );
    }
    return PageView.builder(
      controller: _pageController,
      scrollDirection: Axis.vertical,
      onPageChanged: _onPageChanged,
      itemCount: _items.length,
      itemBuilder: (context, index) {
        final post = _items[index];
        final videoUrl = _firstVideoUrl(post);
        // Активный — текущая страница. Только она autoplay'ит видео.
        final isActive = index == _currentIndex;
        return _ReelPage(
          post: post,
          videoUrl: videoUrl,
          isActive: isActive,
        );
      },
    );
  }
}

/// Одна страница в `ReelsScreen`. Полноэкранное видео + overlay.
/// Каждый _ReelPage содержит свой `VideoMediaPlayer` — `key` по post.id
/// чтобы контроллеры пересоздавались при смене поста.
class _ReelPage extends StatefulWidget {
  const _ReelPage({
    required this.post,
    required this.videoUrl,
    required this.isActive,
  });

  final FeedPost post;
  final String? videoUrl;
  final bool isActive;

  @override
  State<_ReelPage> createState() => _ReelPageState();
}

class _ReelPageState extends State<_ReelPage> {
  late FeedPost _post;
  final _repo = FeedRepository();
  bool _likeInFlight = false;

  @override
  void initState() {
    super.initState();
    _post = widget.post;
  }

  Future<void> _onLikeTap() async {
    if (_likeInFlight) return;
    final wasLiked = _post.isLikedByMe;
    final wasCount = _post.likesCount;
    setState(() {
      _likeInFlight = true;
      _post = _post.copyWith(
        isLikedByMe: !wasLiked,
        likesCount: wasLiked ? wasCount - 1 : wasCount + 1,
      );
    });
    try {
      final result = wasLiked
          ? await _repo.unlikePost(_post.id)
          : await _repo.likePost(_post.id);
      if (!mounted) return;
      setState(() => _post = _post.copyWith(
            isLikedByMe: result.liked,
            likesCount: result.likesCount,
          ));
    } catch (_) {
      if (!mounted) return;
      setState(() => _post = _post.copyWith(
            isLikedByMe: wasLiked,
            likesCount: wasCount,
          ));
    } finally {
      if (mounted) setState(() => _likeInFlight = false);
    }
  }

  void _openComments() {
    showCommentsSheet(
      context,
      postId: _post.id,
      initialCount: _post.commentsCount,
      onCountChanged: (n) {
        if (mounted) setState(() => _post = _post.copyWith(commentsCount: n));
      },
    );
  }

  void _openDetail() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => PostDetailScreen(postId: _post.id, initial: _post),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final url = widget.videoUrl;
    return Stack(
      fit: StackFit.expand,
      children: [
        // Видео на весь экран
        if (url != null && widget.isActive)
          VideoMediaPlayer(
            key: ValueKey('reel-${_post.id}'),
            mediaUrl: url,
            autoplay: true,
            muted: true,
            loop: true,
            fit: BoxFit.contain,
          )
        else
          Container(color: Colors.black),
        // Градиент снизу для читаемости текста
        const Positioned(
          left: 0,
          right: 0,
          bottom: 0,
          height: 240,
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Colors.transparent, Colors.black87],
              ),
            ),
          ),
        ),
        // Левый блок: завод + текст + цена
        Positioned(
          left: 16,
          right: 76, // место для actions справа
          bottom: 24,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.storefront, color: Colors.white, size: 16),
                  const SizedBox(width: 6),
                  Flexible(
                    child: Text(
                      _post.factoryName,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 14,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Icon(Icons.verified, color: Colors.lightBlue, size: 14),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                _post.title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 8),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.white30),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      '${_post.priceAmount} ${_post.priceCurrency}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 14,
                      ),
                    ),
                    ConvertedPriceText(
                      amount: _post.priceAmount,
                      fromCurrency: _post.priceCurrency,
                      prefix: ' ',
                      style: const TextStyle(
                        color: Colors.white70,
                        fontSize: 12,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'MOQ ${_post.moq}',
                      style: const TextStyle(
                        color: Colors.white70,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        // Правый столбец действий (TikTok-style)
        Positioned(
          right: 12,
          bottom: 24,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _ReelAction(
                icon: _post.isLikedByMe
                    ? Icons.favorite
                    : Icons.favorite_border,
                label: '${_post.likesCount}',
                color: _post.isLikedByMe ? Colors.red : Colors.white,
                onTap: _likeInFlight ? null : _onLikeTap,
              ),
              const SizedBox(height: 12),
              _ReelAction(
                icon: Icons.mode_comment_outlined,
                label: '${_post.commentsCount}',
                onTap: _openComments,
              ),
              const SizedBox(height: 12),
              _ReelAction(
                icon: Icons.info_outline,
                label: AppLocalizations.of(context)!.reelsMore,
                onTap: _openDetail,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ReelAction extends StatelessWidget {
  const _ReelAction({
    required this.icon,
    required this.label,
    this.color = Colors.white,
    this.onTap,
  });
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(32),
      child: Padding(
        padding: const EdgeInsets.all(8),
        child: Column(
          children: [
            Icon(icon, color: color, size: 32),
            const SizedBox(height: 4),
            Text(
              label,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 11,
                fontWeight: FontWeight.w600,
                shadows: [Shadow(color: Colors.black54, blurRadius: 4)],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
