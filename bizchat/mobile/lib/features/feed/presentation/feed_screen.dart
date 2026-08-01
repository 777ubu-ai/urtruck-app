import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:share_plus/share_plus.dart';
import '../../../core/widgets/double_tap_like.dart';
import '../../../core/api/api_client.dart';
import '../../../core/currency/converted_price_text.dart';
import '../../../core/realtime/realtime_service.dart';
import '../../../core/widgets/loading_skeleton.dart';
import '../../../core/widgets/trust_badge.dart';
import '../../../core/widgets/translatable_text.dart';
import '../../../l10n/app_localizations.dart';
import '../../../core/widgets/video_media_player.dart';
import '../../chat/data/chat_repository.dart';
import '../../chat/presentation/conversation_screen.dart';
import '../../notifications/data/notifications_repository.dart';
import '../../notifications/presentation/notifications_screen.dart';
import '../../chat/presentation/conversations_screen.dart';
import '../../search/presentation/search_screen.dart';
import '../../stories/presentation/stories_ring.dart';
import '../data/feed_repository.dart';
import 'comments_sheet.dart';
import 'hashtag_screen.dart';
import 'post_detail_screen.dart';

/// Главная лента — экран после регистрации.
/// Blueprint §1.1 вкладка «Главная», §2 анатомия поста.
/// На первом спринте — только базовая вертикальная лента с карточками товаров.
/// Stories, Reels, переключатель «Для тебя/Подписки» — Фаза 2.
class FeedScreen extends StatefulWidget {
  const FeedScreen({super.key, this.initialFilter = 'all', this.hideFilterTabs = false});

  /// Стартовый фильтр: 'all' | 'following' | 'hot_deal'.
  final String initialFilter;

  /// Скрыть табы фильтров в AppBar (для Hot Deals вкладки — там сверху только иконка огня).
  final bool hideFilterTabs;

  @override
  State<FeedScreen> createState() => _FeedScreenState();
}

class _FeedScreenState extends State<FeedScreen> {
  final _repo = FeedRepository();
  final _scroll = ScrollController();
  final List<FeedPost> _items = [];
  String? _nextCursor;
  bool _loading = false;
  bool _hasMore = true;
  String? _error;
  late String _filter;

  @override
  void initState() {
    super.initState();
    _filter = widget.initialFilter;
    _loadMore();
    _scroll.addListener(() {
      if (_scroll.position.pixels >=
          _scroll.position.maxScrollExtent - 300) {
        if (!_loading && _hasMore) _loadMore();
      }
    });
    // Убеждаемся что WS подключён — индикатор и колокольчик подписываются
    // на realtime stream'ы локально (см. _RealtimeStatusDot, _NotificationBell).
    RealtimeService.instance.connect();
  }

  Future<void> _loadMore({bool forceRefresh = false}) async {
    if (_loading) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final page = await _repo.loadFeed(
        cursor: _nextCursor,
        filter: _filter,
        // forceRefresh передаётся только при pull-to-refresh, чтобы обойти
        // 30-секундный in-memory кэш первой страницы.
        forceRefresh: forceRefresh && _nextCursor == null,
      );
      setState(() {
        _items.addAll(page.items);
        _nextCursor = page.nextCursor;
        _hasMore = page.hasMore;
      });
    } catch (e) {
      // Чистим префикс `Exception: ` чтобы юзер видел нормальный текст
      // (особенно для 401/429/таймаутов polling'а ленты).
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _refresh() async {
    setState(() {
      _items.clear();
      _nextCursor = null;
      _hasMore = true;
    });
    await _loadMore(forceRefresh: true);
  }

  Future<void> _switchFilter(String filter) async {
    if (_filter == filter) return;
    setState(() {
      _filter = filter;
      _items.clear();
      _nextCursor = null;
      _hasMore = true;
    });
    await _loadMore();
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(
        // По мокапу SourceHub слева — только «назад» (стрелка), в центре
        // ничего, справа три иконки: пригласить контакт, сообщения,
        // уведомления. Логотип и слоган на главной панели НЕ показываются —
        // они путают, потому что дублируют название вкладки браузера.
        leading: const _RealtimeStatusDot(),
        title: const SizedBox.shrink(),
        titleSpacing: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.person_add_alt_1_rounded),
            tooltip: l.feedInviteContactTooltip,
            onPressed: () {
              // Пока переносит на «Обзор» — оттуда идёт поиск заводов
              // и добавление в подписки. Позже здесь будет прямая форма
              // «Пригласить контакт» по номеру телефона.
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const SearchScreen()),
              );
            },
          ),
          _ChatIconWithBadge(),
          const Padding(
            padding: EdgeInsets.only(right: 8),
            child: _NotificationBell(),
          ),
        ],
        bottom: widget.hideFilterTabs
            ? null
            : PreferredSize(
                preferredSize: const Size.fromHeight(46),
                child: _FeedFilterTabs(
                  current: _filter,
                  onChanged: _switchFilter,
                ),
              ),
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: _buildBody(),
      ),
    );
  }

  Widget _buildBody() {
    if (_items.isEmpty && _loading) {
      return const FeedSkeletonList();
    }
    if (_items.isEmpty && _error != null) {
      return _ErrorView(error: _error!, onRetry: _refresh);
    }
    if (_items.isEmpty) {
      return _EmptyFeedView(filter: _filter);
    }
    // Index 0 → StoriesRing (горизонтальный скролл сверху)
    // Index 1..N → posts cards
    // Index N+1 (если hasMore) → loader
    final extraTopItems = 1; // StoriesRing
    return ListView.builder(
      controller: _scroll,
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.symmetric(vertical: 8),
      itemCount: extraTopItems + _items.length + (_hasMore ? 1 : 0),
      itemBuilder: (context, index) {
        if (index == 0) {
          return const StoriesRing();
        }
        final postIndex = index - extraTopItems;
        if (postIndex >= _items.length) {
          return const Padding(
            padding: EdgeInsets.all(16),
            child: Center(child: CircularProgressIndicator()),
          );
        }
        return _PostCard(post: _items[postIndex]);
      },
    );
  }
}

class _PostCard extends StatefulWidget {
  const _PostCard({required this.post});
  final FeedPost post;

  @override
  State<_PostCard> createState() => _PostCardState();
}

class _PostCardState extends State<_PostCard> {
  late FeedPost post;
  final FeedRepository _repo = FeedRepository();
  bool _likeInFlight = false;
  bool _saveInFlight = false;

  @override
  void initState() {
    super.initState();
    post = widget.post;
  }

  /// Тап по bookmark — оптимистично переключаем UI, потом await API.
  /// При ошибке откатываем и показываем snackbar.
  Future<void> _onSaveTap() async {
    if (_saveInFlight) return;
    HapticFeedback.lightImpact(); // WOW-2
    final wasSaved = post.isSavedByMe;
    setState(() {
      _saveInFlight = true;
      post = post.copyWith(isSavedByMe: !wasSaved);
    });
    try {
      final result = wasSaved
          ? await _repo.unsavePost(post.id)
          : await _repo.savePost(post.id);
      if (!mounted) return;
      setState(() => post = post.copyWith(isSavedByMe: result.saved));
      final l = AppLocalizations.of(context)!;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(result.saved ? l.postSavedSnack : l.postUnsavedSnack),
          duration: const Duration(seconds: 1),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => post = post.copyWith(isSavedByMe: wasSaved));
      final l = AppLocalizations.of(context)!;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(l.feedSaveError(e.toString())),
          duration: const Duration(seconds: 2),
        ),
      );
    } finally {
      if (mounted) setState(() => _saveInFlight = false);
    }
  }

  /// Открыть чат с заводом этого поста. Логика идентична
  /// `PostDetailScreen._openChatWithFactory` — реальный chat flow вместо
  /// заглушки «Чат с заводом — в Фазе 2».
  Future<void> _openChatWithFactory() async {
    final factoryId = post.factoryUserId;
    if (factoryId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
              AppLocalizations.of(context)!.feedCannotDetermineFactory),
        ),
      );
      return;
    }
    try {
      final repo = ChatRepository();
      final conv = await repo.findOrCreate(factoryId);
      if (!mounted) return;
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => ConversationScreen(
            conversationId: conv.id,
            partnerName: conv.other.name == 'Без имени'
                ? post.factoryName
                : conv.other.name,
            partnerType: conv.other.type,
          ),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.toString().replaceFirst('Exception: ', '')),
          duration: const Duration(seconds: 3),
        ),
      );
    }
  }

  /// Share: native share dialog (WhatsApp/Telegram/копировать) + счётчик.
  Future<void> _onShareTap() async {
    HapticFeedback.lightImpact(); // WOW-2
    final shareUrl = 'https://biz-chat.net/post/${post.id}';
    final shareText = '${post.title}\n\n${post.priceAmount} ${post.priceCurrency}\n\n$shareUrl';
    // WOW-8: системный share sheet (Android/iOS native)
    await SharePlus.instance.share(ShareParams(
      text: shareText,
      subject: post.title,
    ));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
            AppLocalizations.of(context)!.feedShareLinkCopied(shareUrl)),
        duration: const Duration(seconds: 2),
      ),
    );
    try {
      final result = await _repo.sharePost(post.id);
      if (!mounted) return;
      setState(() => post = post.copyWith(sharesCount: result.sharesCount));
    } catch (_) {/* share-счётчик не критичен */}
  }

  /// Открыть bottom sheet с комментариями. Счётчик синхронизируется в
  /// реальном времени через onCountChanged.
  void _onCommentTap() {
    showCommentsSheet(
      context,
      postId: post.id,
      initialCount: post.commentsCount,
      onCountChanged: (newCount) {
        if (!mounted) return;
        setState(() => post = post.copyWith(commentsCount: newCount));
      },
    );
  }

  /// Тап по сердечку — оптимистично переключаем UI и счётчик,
  /// потом await API; если упало — откатываем к прежнему состоянию.
  Future<void> _onLikeTap() async {
    if (_likeInFlight) return; // защита от двойного тапа
    HapticFeedback.lightImpact(); // WOW-2
    final wasLiked = post.isLikedByMe;
    final wasCount = post.likesCount;
    // BUG-009: invalidate feed cache чтобы при возврате лайк отобразился
    FeedRepository.invalidateFeedCache();
    setState(() {
      _likeInFlight = true;
      post = post.copyWith(
        isLikedByMe: !wasLiked,
        likesCount: wasLiked ? wasCount - 1 : wasCount + 1,
      );
    });
    try {
      final result = wasLiked
          ? await _repo.unlikePost(post.id)
          : await _repo.likePost(post.id);
      if (!mounted) return;
      // Синхронизируемся с реальным значением от бэка — на случай если на сервере
      // счётчик уже отличался (другие юзеры лайкали в это же время).
      setState(() {
        post = post.copyWith(
          isLikedByMe: result.liked,
          likesCount: result.likesCount,
        );
      });
    } catch (e) {
      if (!mounted) return;
      // Откатываем оптимистичный апдейт
      setState(() {
        post = post.copyWith(isLikedByMe: wasLiked, likesCount: wasCount);
      });
      final l = AppLocalizations.of(context)!;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(wasLiked
              ? l.feedLikeErrorUnlike(e.toString())
              : l.feedLikeErrorLike(e.toString())),
          duration: const Duration(seconds: 2),
        ),
      );
    } finally {
      if (mounted) setState(() => _likeInFlight = false);
    }
  }

  Future<void> _openDetail() async {
    final updated = await Navigator.of(context).push<FeedPost>(
      MaterialPageRoute(
        builder: (_) => PostDetailScreen(postId: post.id, initial: post),
      ),
    );
    // Если деталка вернула обновлённый пост (например после лайка) — синхронизируем карточку.
    if (updated != null && mounted) {
      setState(() => post = updated);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final l = AppLocalizations.of(context)!;
    final firstMedia = post.media.isNotEmpty ? post.media.first : null;
    // Defensive: бэк теоретически может прислать `url`/`type` не строкой —
    // используем `is String` чтобы не падать в `as String?` cast при rendering.
    final rawUrlValue = firstMedia?['url'];
    final rawMediaUrl = rawUrlValue is String ? rawUrlValue : null;
    final firstMediaUrl =
        rawMediaUrl != null ? ApiClient.resolveMediaUrl(rawMediaUrl) : null;
    final rawTypeValue = firstMedia?['type'];
    final firstMediaIsVideo =
        (rawTypeValue is String && rawTypeValue == 'video') &&
            rawMediaUrl != null;

    // Лента во всю ширину экрана, без «плавающих» карточек с отступами —
    // так устроены ленты соцсетей: фото работает на весь экран.
    return Card(
      margin: const EdgeInsets.only(bottom: 6),
      elevation: 0,
      shape: const RoundedRectangleBorder(),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: _openDetail,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
          // Шапка: аватар + название завода + Trust Score
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 9, 8, 9),
            child: Row(
              children: [
                FactoryAvatar(
                  name: post.factoryName,
                  // Логотип завода: с сервера приходит относительный путь
                  // (/uploads/...), resolveMediaUrl дополняет до абсолютного.
                  imageUrl: post.factoryAvatarUrl == null
                      ? null
                      : ApiClient.resolveMediaUrl(post.factoryAvatarUrl!),
                  size: 34,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        post.factoryName,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          letterSpacing: -0.1,
                          height: 1.15,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      // Живой бейдж вместо «Trust Score: 0» — для нового
                      // завода показывает «Новый», а не мёртвый ноль.
                      TrustBadge(score: post.trustScore),
                    ],
                  ),
                ),
              ],
            ),
          ),
          // Медиа (первое фото или заглушка) + Hot Deal badge поверх
          Stack(
            children: [
              // WOW-1: double-tap to like (Instagram-style)
              DoubleTapLike(
                onLike: () {
                  if (!post.isLikedByMe) _onLikeTap();
                },
                child: AspectRatio(
                aspectRatio: 1,
                child: firstMediaUrl == null
                    ? Container(
                        color: scheme.surfaceContainerHighest,
                        child: Icon(Icons.image,
                            size: 48, color: scheme.onSurfaceVariant),
                      )
                    : firstMediaIsVideo
                        ? VideoMediaPlayer(
                            mediaUrl: rawMediaUrl,
                            autoplay: false, // в ленте — preview, не auto-play
                            fit: BoxFit.cover,
                          )
                        : CachedNetworkImage(
                            imageUrl: firstMediaUrl,
                            fit: BoxFit.cover,
                            placeholder: (_, __) => Container(
                              color: scheme.surfaceContainerHighest,
                              child: const Center(
                                child: CircularProgressIndicator(
                                    strokeWidth: 2),
                              ),
                            ),
                            errorWidget: (_, __, ___) => Container(
                              color: scheme.surfaceContainerHighest,
                              child: Icon(Icons.broken_image,
                                  color: scheme.onSurfaceVariant),
                            ),
                          ),
                ),
              ),
              if (post.isHotDeal && post.discountPercent > 0)
                Positioned(
                  top: 12,
                  left: 12,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.red,
                      borderRadius: BorderRadius.circular(6),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.2),
                          blurRadius: 4,
                          offset: const Offset(0, 2),
                        ),
                      ],
                    ),
                    child: Text(
                      '🔥 -${post.discountPercent}%',
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 13,
                      ),
                    ),
                  ),
                ),
              // Group Buy badge с прогрессом
              if (post.groupBuy != null)
                Positioned(
                  top: 12,
                  right: 12,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.deepPurple,
                      borderRadius: BorderRadius.circular(6),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.2),
                          blurRadius: 4,
                          offset: const Offset(0, 2),
                        ),
                      ],
                    ),
                    child: Text(
                      '👥 ${(post.groupBuy!.progress * 100).toStringAsFixed(0)}%',
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 13,
                      ),
                    ),
                  ),
                ),
            ],
          ),
          // Кнопки действий
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
            child: Row(
              children: [
                IconButton(
                  // AnimatedSwitcher с ScaleTransition даёт «pop» эффект
                  // при тапе на сердце — UX как в Instagram. Key обязателен,
                  // чтобы Switcher распознал смену child'a.
                  icon: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 220),
                    transitionBuilder: (child, anim) => ScaleTransition(
                      scale: Tween<double>(begin: 0.6, end: 1.0).animate(
                        CurvedAnimation(
                            parent: anim, curve: Curves.elasticOut),
                      ),
                      child: child,
                    ),
                    child: Icon(
                      post.isLikedByMe
                          ? Icons.favorite_rounded
                          : Icons.favorite_border_rounded,
                      key: ValueKey<bool>(post.isLikedByMe),
                      size: 24,
                      color: post.isLikedByMe ? const Color(0xFFFF3040) : null,
                    ),
                  ),
                  onPressed: _onLikeTap,
                  visualDensity: VisualDensity.compact,
                ),
                IconButton(
                  icon: const Icon(Icons.chat_bubble_outline_rounded, size: 23),
                  onPressed: _onCommentTap,
                  visualDensity: VisualDensity.compact,
                ),
                IconButton(
                  icon: const Icon(Icons.near_me_outlined, size: 23),
                  onPressed: _onShareTap,
                  visualDensity: VisualDensity.compact,
                ),
                const Spacer(),
                // Кнопка «Связаться» прямо на карточке — по мокапу SourceHub.
                // Быстрый чат с заводом, не открывая карточку товара.
                Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: FilledButton.icon(
                    onPressed: _openChatWithFactory,
                    icon: const Icon(Icons.chat_rounded, size: 16),
                    label: Text(
                      AppLocalizations.of(context)!.postContact,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    style: FilledButton.styleFrom(
                      visualDensity: VisualDensity.compact,
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 0),
                      minimumSize: const Size(0, 32),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(999),
                      ),
                    ),
                  ),
                ),
                IconButton(
                  icon: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 220),
                    transitionBuilder: (child, anim) => ScaleTransition(
                      scale: Tween<double>(begin: 0.6, end: 1.0).animate(
                        CurvedAnimation(
                            parent: anim, curve: Curves.elasticOut),
                      ),
                      child: child,
                    ),
                    child: Icon(
                      post.isSavedByMe
                          ? Icons.bookmark_rounded
                          : Icons.bookmark_border_rounded,
                      key: ValueKey<bool>(post.isSavedByMe),
                      size: 23,
                    ),
                  ),
                  onPressed: _saveInFlight ? null : _onSaveTap,
                  visualDensity: VisualDensity.compact,
                ),
              ],
            ),
          ),
          // Заголовок + описание
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (post.likesCount > 0)
                  Text(
                    l.feedLikesCount(post.likesCount),
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                  ),
                const SizedBox(height: 4),
                // Заголовок с автопереводом: завод пишет по-китайски —
                // покупатель сразу видит на своём языке.
                TranslatableText(
                  text: post.title,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    letterSpacing: -0.2,
                    height: 1.25,
                  ),
                ),
                const SizedBox(height: 7),
                // Характеристики — компактные чипы вместо блёклого текста.
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    _MetaChip(
                      icon: Icons.inventory_2_rounded,
                      label: l.feedMoqShort(post.moq),
                    ),
                    _MetaChip(
                      icon: Icons.local_shipping_rounded,
                      label: l.feedShippingDaysShort(post.shippingDays),
                    ),
                  ],
                ),
                if (post.description != null &&
                    post.description!.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  TranslatableText(
                    text: post.description!,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 14, height: 1.35),
                  ),
                ],
                const SizedBox(height: 8),
                // Кнопка цены — главная фича Blueprint §2.2.
                // ВАЖНО: НЕ оборачивать FilledButton + ConvertedPriceText в Row
                // внутри этой Column (loose width) — будет BoxConstraints forces
                // infinite width. ConvertedPriceText кладём отдельной строкой.
                // Цена — главный элемент карточки маркетплейса: крупная,
                // читаемая с первого взгляда. Тап открывает лист с тиражами.
                InkWell(
                  onTap: () => _showPriceSheet(context),
                  borderRadius: BorderRadius.circular(14),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 2),
                    child: Row(
                      children: [
                        Flexible(
                          child: Text(
                            (double.tryParse(post.priceAmount) ?? 0) > 100000
                                ? AppLocalizations.of(context)!
                                    .feedPriceOnRequest
                                : _formatPrice(
                                    post.priceAmount, post.priceCurrency),
                            style: const TextStyle(
                              fontSize: 19,
                              fontWeight: FontWeight.w800,
                              letterSpacing: -0.5,
                              height: 1.1,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Icon(
                          Icons.expand_more_rounded,
                          size: 20,
                          color: scheme.onSurfaceVariant,
                        ),
                      ],
                    ),
                  ),
                ),
                ConvertedPriceText(
                  amount: post.priceAmount,
                  fromCurrency: post.priceCurrency,
                  prefix: '',
                ),
                if (post.hashtags.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 6,
                    children: post.hashtags
                        .take(5)
                        .map((tag) => ActionChip(
                              label: Text('#$tag'),
                              visualDensity: VisualDensity.compact,
                              padding: EdgeInsets.zero,
                              onPressed: () {
                                Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) => HashtagScreen(tag: tag),
                                  ),
                                );
                              },
                            ))
                        .toList(),
                  ),
                ],
              ],
            ),
          ),
        ],
        ),
      ),
    );
  }

  void _showPriceSheet(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    showModalBottomSheet(
      context: context,
      showDragHandle: true,
      builder: (_) => Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              l.postPriceSheetTitle,
              style: Theme.of(context).textTheme.titleLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            Text(
              '${post.priceAmount} ${post.priceCurrency}',
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
              textAlign: TextAlign.center,
            ),
            ConvertedPriceText(
              amount: post.priceAmount,
              fromCurrency: post.priceCurrency,
              prefix: '',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
            ),
            const SizedBox(height: 16),
            Text(
              l.feedPriceSheetLine(post.moq, post.shippingDays),
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: () {
                Navigator.pop(context);
                _openChatWithFactory();
              },
              child: Text(l.postWriteToFactory),
            ),
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: () => Navigator.pop(context),
              child: Text(l.commonClose),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyFeedView extends StatelessWidget {
  const _EmptyFeedView({required this.filter});
  final String filter;
  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    late final IconData icon;
    late final String title;
    late final String message;
    switch (filter) {
      case 'following':
        icon = Icons.person_add_outlined;
        title = l.feedEmptyFollowingTitle;
        message = l.feedEmptyFollowingBody;
        break;
      case 'hot_deal':
        icon = Icons.local_fire_department_outlined;
        title = l.feedEmptyHotDealTitle;
        message = l.feedEmptyHotDealBody;
        break;
      default:
        icon = Icons.inbox_outlined;
        title = l.feedEmptyGenericTitle;
        message = l.feedEmptyGenericBody;
    }
    final scheme = Theme.of(context).colorScheme;
    // Пустой экран не должен выглядеть «поломкой»: иконка в фирменном
    // круге-градиенте и внятный текст вместо серого значка на пустоте.
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.symmetric(horizontal: 32),
      children: [
        const SizedBox(height: 110),
        Center(
          child: Container(
            width: 96,
            height: 96,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  const Color(0xFF0B66FF).withValues(alpha: 0.12),
                  const Color(0xFF00C2FF).withValues(alpha: 0.12),
                ],
              ),
            ),
            child: Icon(icon, size: 44, color: const Color(0xFF0B66FF)),
          ),
        ),
        const SizedBox(height: 20),
        Text(
          title,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            letterSpacing: -0.3,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          message,
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 14,
            height: 1.4,
            color: scheme.onSurfaceVariant,
          ),
        ),
      ],
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.error, required this.onRetry});
  final String error;
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        const SizedBox(height: 120),
        Icon(
          Icons.error_outline,
          size: 80,
          color: Theme.of(context).colorScheme.error,
        ),
        const SizedBox(height: 16),
        Text(
          l.feedLoadError,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 8),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Text(
            error,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
          ),
        ),
        const SizedBox(height: 16),
        Center(
          child: FilledButton.tonal(
            onPressed: onRetry,
            child: Text(l.commonRetry),
          ),
        ),
      ],
    );
  }
}

/// Переключатель «Все / Подписки / 🔥» в AppBar ленты. Segment control.
class _FeedFilterTabs extends StatelessWidget {
  const _FeedFilterTabs({required this.current, required this.onChanged});
  final String current; // 'all' | 'following' | 'hot_deal'
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      mainAxisSize: MainAxisSize.min,
      children: [
        _FilterTab(
          label: l.feedAll,
          active: current == 'all',
          onTap: () => onChanged('all'),
        ),
        const SizedBox(width: 6),
        _FilterTab(
          label: l.feedFollowing,
          active: current == 'following',
          onTap: () => onChanged('following'),
        ),
        const SizedBox(width: 6),
        _FilterTab(
          label: '🔥 ${l.feedHotDeals}',
          active: current == 'hot_deal',
          onTap: () => onChanged('hot_deal'),
        ),
      ],
    );
  }
}

class _FilterTab extends StatelessWidget {
  const _FilterTab({
    required this.label,
    required this.active,
    required this.onTap,
  });
  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    // Активная вкладка — залитая «таблетка»: сразу видно, где находишься
    // (раньше отличалась только размером шрифта и терялась).
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(100),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOut,
        padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 13),
        decoration: BoxDecoration(
          color: active ? scheme.onSurface : Colors.transparent,
          borderRadius: BorderRadius.circular(100),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 14,
            fontWeight: active ? FontWeight.w700 : FontWeight.w600,
            letterSpacing: -0.1,
            color: active ? scheme.surface : scheme.onSurfaceVariant,
          ),
        ),
      ),
    );
  }
}

/// Цветная точка-индикатор состояния WebSocket-соединения.
/// Подписывается на `RealtimeService.statusStream` локально, чтобы
/// обновляться **независимо** от parent ленты — без rebuild всего ListView
/// при каждом изменении статуса.
class _RealtimeStatusDot extends StatefulWidget {
  const _RealtimeStatusDot();

  @override
  State<_RealtimeStatusDot> createState() => _RealtimeStatusDotState();
}

class _RealtimeStatusDotState extends State<_RealtimeStatusDot> {
  late RealtimeStatus _status;
  StreamSubscription<RealtimeStatus>? _sub;

  @override
  void initState() {
    super.initState();
    _status = RealtimeService.instance.status;
    _sub = RealtimeService.instance.statusStream.listen((s) {
      if (mounted) setState(() => _status = s);
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  Color get _color {
    switch (_status) {
      case RealtimeStatus.connected:
        return Colors.green;
      case RealtimeStatus.connecting:
        return Colors.orange;
      case RealtimeStatus.error:
        return Colors.red;
      case RealtimeStatus.disconnected:
        return Colors.grey;
    }
  }

  String _tooltipFor(AppLocalizations l) {
    switch (_status) {
      case RealtimeStatus.connected:
        return l.feedRealtimeConnected;
      case RealtimeStatus.connecting:
        return l.feedRealtimeConnecting;
      case RealtimeStatus.error:
        return l.feedRealtimeError;
      case RealtimeStatus.disconnected:
        return l.feedRealtimeDisconnected;
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    // Когда связь в порядке — индикатор не показываем: пользователю не нужен
    // технический сигнал «всё хорошо», он только засорял шапку. Точка
    // появляется лишь при проблемах со связью.
    if (_status == RealtimeStatus.connected) {
      return const SizedBox.shrink();
    }
    return Tooltip(
      message: _tooltipFor(l),
      child: Center(
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          width: 10,
          height: 10,
          decoration: BoxDecoration(
            color: _color,
            shape: BoxShape.circle,
            boxShadow: _status == RealtimeStatus.connected
                ? [
                    BoxShadow(
                      color: _color.withValues(alpha: 0.6),
                      blurRadius: 6,
                    ),
                  ]
                : null,
          ),
        ),
      ),
    );
  }
}

/// Колокольчик уведомлений с бейджем непрочитанных. Самостоятельный
/// stateful widget — подписывается на `notificationStream` и polling
/// `/unread-count` каждые 10 сек **локально**. Это означает что обновление
/// бейджа не триггерит rebuild всей ленты (раньше это был setState
/// в `_FeedScreenState`, который пересоздавал весь Scaffold).
class _NotificationBell extends StatefulWidget {
  const _NotificationBell();

  @override
  State<_NotificationBell> createState() => _NotificationBellState();
}

class _NotificationBellState extends State<_NotificationBell> {
  final _repo = NotificationsRepository();
  int _unread = 0;
  Timer? _pollTimer;
  StreamSubscription<Map<String, dynamic>>? _wsSub;

  @override
  void initState() {
    super.initState();
    _refresh();
    _pollTimer =
        Timer.periodic(const Duration(seconds: 10), (_) => _refresh());
    _wsSub = RealtimeService.instance.notificationStream.listen((_) {
      if (mounted) setState(() => _unread += 1);
    });
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _wsSub?.cancel();
    super.dispose();
  }

  Future<void> _refresh() async {
    if (!mounted) return;
    try {
      final c = await _repo.getUnreadCount();
      if (!mounted) return;
      if (c != _unread) setState(() => _unread = c);
    } catch (_) {/* polling — игнорируем */}
  }

  Future<void> _open() async {
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const NotificationsScreen()),
    );
    // На возврате обновляем (юзер мог пометить read-all)
    await _refresh();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      alignment: Alignment.center,
      children: [
        IconButton(
          icon: const Icon(Icons.notifications_none),
          tooltip: AppLocalizations.of(context)!.feedNotificationsTooltip,
          onPressed: _open,
        ),
        if (_unread > 0)
          Positioned(
            top: 8,
            right: 6,
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
              constraints: const BoxConstraints(minWidth: 16),
              decoration: BoxDecoration(
                color: Colors.red,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                _unread > 99 ? '99+' : '$_unread',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
      ],
    );
  }
}

/// Иконка чата в шапке ленты с бейджем непрочитанных диалогов.
/// Заменяет одноимённую вкладку в нижнем меню — теперь чаты живут в
/// верхней панели, как в мокапе SourceHub и в Instagram.
class _ChatIconWithBadge extends StatefulWidget {
  @override
  State<_ChatIconWithBadge> createState() => _ChatIconWithBadgeState();
}

class _ChatIconWithBadgeState extends State<_ChatIconWithBadge> {
  final _repo = ChatRepository();
  int _unread = 0;
  Timer? _pollTimer;
  StreamSubscription<Map<String, dynamic>>? _wsSub;

  @override
  void initState() {
    super.initState();
    _refresh();
    _pollTimer =
        Timer.periodic(const Duration(seconds: 15), (_) => _refresh());
    _wsSub = RealtimeService.instance.messageStream.listen((data) {
      if (data['_type'] != null) return;
      if (mounted) setState(() => _unread += 1);
    });
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _wsSub?.cancel();
    super.dispose();
  }

  Future<void> _refresh() async {
    if (!mounted) return;
    try {
      final c = await _repo.getTotalUnreadCount();
      if (!mounted) return;
      if (c != _unread) setState(() => _unread = c);
    } catch (_) {/* polling — игнорируем */}
  }

  Future<void> _open() async {
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const ConversationsScreen()),
    );
    await _refresh();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      alignment: Alignment.center,
      children: [
        IconButton(
          icon: const Icon(Icons.chat_bubble_outline_rounded),
          tooltip: AppLocalizations.of(context)!.navChats,
          onPressed: _open,
        ),
        if (_unread > 0)
          Positioned(
            top: 8,
            right: 6,
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
              constraints: const BoxConstraints(minWidth: 16),
              decoration: BoxDecoration(
                color: Colors.red,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                _unread > 99 ? '99+' : '$_unread',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
      ],
    );
  }
}

/// Компактный чип характеристики товара (MOQ, срок доставки).
/// Заменяет блёклый текст с иконкой — визуально «собирает» метаданные.
class _MetaChip extends StatelessWidget {
  const _MetaChip({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(100),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: scheme.onSurfaceVariant),
          const SizedBox(width: 5),
          Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: scheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}

/// Человеческий формат цены: «500.00 KZT» → «500 ₸», «1.00 USD» → «$1».
/// Хвостовые нули убираем, символ валюты ставим по локальной привычке
/// (для USD/EUR — перед суммой, для остальных — после).
String _formatPrice(String amount, String currency) {
  final value = double.tryParse(amount);
  String number;
  if (value == null) {
    number = amount;
  } else if (value == value.roundToDouble()) {
    number = value.toStringAsFixed(0);
  } else {
    number = value.toStringAsFixed(2);
  }

  // Разделитель тысяч пробелом: 1234567 → 1 234 567
  final parts = number.split('.');
  final intPart = parts[0].replaceAllMapped(
    RegExp(r'(\d)(?=(\d{3})+$)'),
    (m) => '${m[1]} ',
  );
  number = parts.length > 1 ? '$intPart.${parts[1]}' : intPart;

  switch (currency.toUpperCase()) {
    case 'USD':
      return '\$$number';
    case 'EUR':
      return '€$number';
    case 'KZT':
      return '$number ₸';
    case 'RUB':
      return '$number ₽';
    case 'CNY':
      return '$number ¥';
    default:
      return '$number $currency';
  }
}
