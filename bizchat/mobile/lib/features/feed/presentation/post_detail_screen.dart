import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../../core/api/api_client.dart';
import '../../../core/widgets/trust_badge.dart';
import '../../../core/currency/converted_price_text.dart';
import '../../../core/storage/auth_storage.dart';
import '../../../l10n/app_localizations.dart';
import '../../../core/widgets/photo_viewer.dart';
import '../../moderation/data/moderation_repository.dart';
import '../../moderation/presentation/report_dialog.dart';
import '../../../core/widgets/video_media_player.dart';
import '../../chat/data/chat_repository.dart';
import '../../chat/presentation/conversation_screen.dart';
import '../../profile/data/profile_repository.dart';
import '../../reviews/presentation/reviews_list_screen.dart';
import '../data/feed_repository.dart';
import 'comments_sheet.dart';
import 'hashtag_screen.dart';

/// Экран детали товара. Открывается тапом по карточке в ленте.
///
/// Принимает либо `initial` (уже загруженный пост из ленты — показываем сразу,
/// без спиннера), либо только `postId` (тогда грузим с нуля). При наличии
/// initial всё равно делаем фоновый refresh, чтобы подтянуть свежие данные —
/// например, обновлённый счётчик лайков от других пользователей.
class PostDetailScreen extends StatefulWidget {
  const PostDetailScreen({super.key, required this.postId, this.initial});

  final String postId;
  final FeedPost? initial;

  @override
  State<PostDetailScreen> createState() => _PostDetailScreenState();
}

class _PostDetailScreenState extends State<PostDetailScreen> {
  final _repo = FeedRepository();
  final _pageController = PageController();

  FeedPost? _post;
  String? _error;
  bool _loading = false;
  bool _likeInFlight = false;
  bool _saveInFlight = false;
  bool _deleting = false;
  bool _followInFlight = false;
  bool? _isFollowing; // null = ещё не загружено
  String? _myUserId;
  int _mediaIndex = 0;
  // Translation state
  String? _translatedTitle; // null = не переведено
  String? _translatedDescription; // null = не переведено
  bool _translatingDescription = false;

  @override
  void initState() {
    super.initState();
    _post = widget.initial;
    _loadMyUserId();
    _load();
    _loadFollowStatus();
  }

  /// Загружаем `isFollowing` отдельным запросом к /users/:factoryUserId —
  /// это небольшой overhead ради правильного состояния кнопки follow.
  Future<void> _loadFollowStatus() async {
    final post = _post;
    if (post == null || post.factoryUserId == null) return;
    try {
      final profileRepo = ProfileRepository();
      final publicProfile =
          await profileRepo.loadPublicProfile(post.factoryUserId!);
      if (!mounted) return;
      setState(() => _isFollowing = publicProfile.isFollowing);
    } catch (_) {
      // На любую ошибку (401/429/network) фолбэчим в `not following` —
      // иначе кнопка останется в `null` и пользователь увидит вечный спиннер.
      if (mounted) setState(() => _isFollowing = false);
    }
  }

  Future<void> _onFollowTap() async {
    final post = _post;
    if (post == null || post.factoryUserId == null || _followInFlight) return;
    if (post.factoryUserId == _myUserId) return;
    final was = _isFollowing ?? false;
    setState(() {
      _followInFlight = true;
      _isFollowing = !was;
    });
    try {
      final profileRepo = ProfileRepository();
      if (was) {
        await profileRepo.unfollow(post.factoryUserId!);
      } else {
        await profileRepo.follow(post.factoryUserId!);
      }
      if (!mounted) return;
      final l = AppLocalizations.of(context)!;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(was
              ? l.postUnfollowed(post.factoryName)
              : l.postFollowed(post.factoryName)),
          duration: const Duration(seconds: 1),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _isFollowing = was); // откат
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
      );
    } finally {
      if (mounted) setState(() => _followInFlight = false);
    }
  }

  /// Открыть bottom sheet с вводом количества для group buy.
  Future<void> _openGroupBuySheet() async {
    final post = _post;
    if (post == null || post.groupBuy == null) return;
    final gb = post.groupBuy!;
    final l = AppLocalizations.of(context)!;
    if (!gb.isActive) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(gb.isGoalReached
              ? l.groupBuyGoalReached
              : l.groupBuyExpired),
        ),
      );
      return;
    }
    if (post.factoryUserId == _myUserId) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l.groupBuyOwnPost)),
      );
      return;
    }
    final result = await showModalBottomSheet<int>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) => _GroupBuyJoinSheet(
        initialQuantity: gb.myOrderQuantity > 0 ? gb.myOrderQuantity : 100,
        unitPrice: gb.unitPrice,
        currency: post.priceCurrency,
      ),
    );
    if (result == null || !mounted) return;
    // Оптимистичный UI не делаем — сразу await, показываем loader.
    try {
      final res = await _repo.joinGroupBuy(post.id, result);
      if (!mounted) return;
      // Берём актуальный snapshot — за время await `_post` теоретически
      // мог быть пересоздан другим путём. Не разыменовываем `_post!` напрямую.
      final current = _post;
      if (current == null || current.groupBuy == null) return;
      setState(() {
        _post = current.copyWith(
          groupBuy: current.groupBuy!.copyWith(
            currentQuantity: res.currentQuantity,
            participantCount: res.participantCount,
            myOrderQuantity: res.myQuantity,
            isGoalReached: res.isGoalReached,
          ),
        );
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(l.groupBuyJoinedSnack(
              res.myQuantity, res.currentQuantity)),
          duration: const Duration(seconds: 2),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.toString().replaceFirst('Exception: ', '')),
        ),
      );
    }
  }

  Future<void> _onLeaveGroupBuy() async {
    final post = _post;
    if (post == null || post.groupBuy == null) return;
    final l = AppLocalizations.of(context)!;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(l.groupBuyLeaveConfirmTitle),
        content: Text(l.groupBuyLeaveConfirmBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(l.commonNo),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(l.groupBuyLeaveConfirmAction),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      final res = await _repo.leaveGroupBuy(post.id);
      if (!mounted) return;
      // Защита от race: между взятием `post` snapshot'а и await `_post`
      // мог быть переоткрыт. Берём актуальный state и проверяем groupBuy.
      final current = _post;
      if (current == null || current.groupBuy == null) return;
      setState(() {
        _post = current.copyWith(
          groupBuy: current.groupBuy!.copyWith(
            currentQuantity: res.currentQuantity,
            participantCount: res.participantCount,
            myOrderQuantity: 0,
            isGoalReached: res.isGoalReached,
          ),
        );
      });
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.toString().replaceFirst('Exception: ', '')),
        ),
      );
    }
  }

  /// Перевести название И описание поста на язык юзера.
  /// BUG-008: раньше переводилось только описание, title оставался на китайском.
  Future<void> _translateDescription() async {
    final post = _post;
    if (post == null) return;
    if (_translatingDescription) return;
    // Toggle: если уже переведено — возвращаем к оригиналу
    if (_translatedDescription != null || _translatedTitle != null) {
      setState(() {
        _translatedTitle = null;
        _translatedDescription = null;
      });
      return;
    }
    setState(() => _translatingDescription = true);
    try {
      final repo = ProfileRepository();
      // Язык перевода = язык интерфейса пользователя (не hardcoded 'ru')
      final uiLang = Localizations.localeOf(context).languageCode;
      // Переводим title
      final titleTranslated = await repo.translate(
        text: post.title,
        targetLang: uiLang,
      );
      // Переводим description если есть и отличается от title
      String? descTranslated;
      if (post.description != null &&
          post.description!.isNotEmpty &&
          post.description != post.title) {
        descTranslated = await repo.translate(
          text: post.description!,
          targetLang: uiLang,
        );
      }
      if (!mounted) return;
      setState(() {
        _translatedTitle = titleTranslated;
        _translatedDescription = descTranslated;
      });
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
      );
    } finally {
      if (mounted) setState(() => _translatingDescription = false);
    }
  }

  Future<void> _loadMyUserId() async {
    try {
      final id = await AuthStorage.instance.readUserId();
      if (mounted) setState(() => _myUserId = id);
    } catch (_) {/* нет сессии — кнопка удаления просто не покажется */}
  }

  Future<void> _confirmAndDelete() async {
    final post = _post;
    if (post == null || _deleting) return;
    final l = AppLocalizations.of(context)!;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(l.postDeleteConfirm),
        content: Text(l.postDeleteConfirmBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(l.commonCancel),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(context, true),
            child: Text(l.commonDelete),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _deleting = true);
    try {
      await _repo.deletePost(post.id);
      // Кэш ленты больше не валиден — следующее открытие фида получит свежее.
      FeedRepository.invalidateFeedCache();
      if (!mounted) return;
      // Возвращаемся на ленту, передавая null чтобы лента поняла «пост удалён»
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(l.postDeletedWithTitle(post.title)),
          duration: const Duration(seconds: 2),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _deleting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.toString().replaceFirst('Exception: ', '')),
          duration: const Duration(seconds: 3),
        ),
      );
    }
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final fresh = await _repo.loadPost(widget.postId);
      if (!mounted) return;
      setState(() {
        _post = fresh;
        _error = null;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _onLikeTap() async {
    final current = _post;
    if (current == null || _likeInFlight) return;
    final wasLiked = current.isLikedByMe;
    final wasCount = current.likesCount;
    setState(() {
      _likeInFlight = true;
      _post = current.copyWith(
        isLikedByMe: !wasLiked,
        likesCount: wasLiked ? wasCount - 1 : wasCount + 1,
      );
    });
    try {
      final result = wasLiked
          ? await _repo.unlikePost(current.id)
          : await _repo.likePost(current.id);
      if (!mounted) return;
      setState(() {
        _post = _post!.copyWith(
          isLikedByMe: result.liked,
          likesCount: result.likesCount,
        );
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _post = _post!.copyWith(isLikedByMe: wasLiked, likesCount: wasCount);
      });
      final l = AppLocalizations.of(context)!;
      final errText = e.toString().replaceFirst('Exception: ', '');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(wasLiked
              ? l.postUnlikeError(errText)
              : l.postLikeError(errText)),
          duration: const Duration(seconds: 2),
        ),
      );
    } finally {
      if (mounted) setState(() => _likeInFlight = false);
    }
  }

  /// Share: копируем ссылку в clipboard и инкрементируем счётчик на бэке.
  Future<void> _onShareTap() async {
    final post = _post;
    if (post == null) return;
    final shareUrl = 'https://biz-chat.net/post/${post.id}';
    await Clipboard.setData(ClipboardData(text: shareUrl));

    // Оптимистично инкрементируем счётчик; бэк в ответе даст точное значение.
    setState(() {
      _post = _post!.copyWith(sharesCount: post.sharesCount + 1);
    });

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
              AppLocalizations.of(context)!.feedShareLinkCopied(shareUrl)),
          duration: const Duration(seconds: 2),
        ),
      );
    }

    try {
      final result = await _repo.sharePost(post.id);
      if (!mounted) return;
      setState(() {
        _post = _post!.copyWith(sharesCount: result.sharesCount);
      });
    } catch (_) {
      // Счётчик — не критично, игнорируем ошибку сети. Ссылка в clipboard уже есть.
    }
  }

  Future<void> _onSaveTap() async {
    final current = _post;
    if (current == null || _saveInFlight) return;
    final wasSaved = current.isSavedByMe;
    setState(() {
      _saveInFlight = true;
      _post = current.copyWith(isSavedByMe: !wasSaved);
    });
    try {
      final result = wasSaved
          ? await _repo.unsavePost(current.id)
          : await _repo.savePost(current.id);
      if (!mounted) return;
      final l = AppLocalizations.of(context)!;
      setState(() => _post = _post!.copyWith(isSavedByMe: result.saved));
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
              result.saved ? l.postSavedSnack : l.postUnsavedSnack),
          duration: const Duration(seconds: 1),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      final l = AppLocalizations.of(context)!;
      setState(() => _post = _post!.copyWith(isSavedByMe: wasSaved));
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
              l.postSaveError(e.toString().replaceFirst('Exception: ', ''))),
          duration: const Duration(seconds: 2),
        ),
      );
    } finally {
      if (mounted) setState(() => _saveInFlight = false);
    }
  }

  void _openComments() {
    final post = _post;
    if (post == null) return;
    showCommentsSheet(
      context,
      postId: post.id,
      initialCount: post.commentsCount,
      onCountChanged: (newCount) {
        if (!mounted) return;
        setState(() {
          _post = _post!.copyWith(commentsCount: newCount);
        });
      },
    );
  }

  /// Открыть чат с заводом-владельцем поста. Если беседы нет — бэк её создаст.
  /// Защита от тапа на свой собственный пост.
  Future<void> _openChatWithFactory() async {
    final post = _post;
    if (post == null) return;
    final l = AppLocalizations.of(context)!;
    final factoryId = post.factoryUserId;
    if (factoryId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l.postFactoryNotFound)),
      );
      return;
    }
    if (factoryId == _myUserId) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l.postOwnPostMsg)),
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

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final isOwner = _post != null &&
        _myUserId != null &&
        _post!.factoryUserId != null &&
        _post!.factoryUserId == _myUserId;
    return Scaffold(
      appBar: AppBar(
        title: Text(l.postDetailTitle),
        actions: [
          if (isOwner)
            IconButton(
              icon: _deleting
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.delete_outline),
              tooltip: l.postDelete,
              onPressed: _deleting ? null : _confirmAndDelete,
            ),
          if (!isOwner && _post != null)
            PopupMenuButton<String>(
              icon: const Icon(Icons.more_vert),
              onSelected: (action) async {
                if (action == 'report') {
                  await showReportDialog(
                    context,
                    targetType: 'post',
                    targetId: _post!.id,
                  );
                } else if (action == 'block') {
                  final ownerId = _post!.factoryUserId;
                  if (ownerId == null) return;
                  final confirmed = await showDialog<bool>(
                    context: context,
                    builder: (ctx) => AlertDialog(
                      title: Text(l.blockUserConfirmTitle),
                      content: Text(l.blockUserConfirmBody),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.pop(ctx, false),
                          child: Text(l.commonCancel),
                        ),
                        FilledButton(
                          onPressed: () => Navigator.pop(ctx, true),
                          style: FilledButton.styleFrom(
                            backgroundColor: Colors.red,
                          ),
                          child: Text(l.blockUserAction),
                        ),
                      ],
                    ),
                  );
                  if (confirmed != true || !mounted) return;
                  try {
                    await ModerationRepository().blockUser(ownerId);
                    if (!mounted) return;
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text(l.blockUserDone)),
                    );
                    Navigator.of(context).pop();
                  } catch (e) {
                    if (!mounted) return;
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text(
                            e.toString().replaceFirst('Exception: ', '')),
                      ),
                    );
                  }
                }
              },
              itemBuilder: (_) => [
                PopupMenuItem(
                  value: 'report',
                  child: Row(
                    children: [
                      const Icon(Icons.flag_outlined, size: 20),
                      const SizedBox(width: 12),
                      Text(l.postMenuReport),
                    ],
                  ),
                ),
                PopupMenuItem(
                  value: 'block',
                  child: Row(
                    children: [
                      const Icon(Icons.block, size: 20, color: Colors.red),
                      const SizedBox(width: 12),
                      Text(l.postMenuBlock),
                    ],
                  ),
                ),
              ],
            ),
        ],
      ),
      body: _buildBody(),
      bottomNavigationBar: _post != null ? _buildBottomBar(_post!) : null,
    );
  }

  Widget _buildBody() {
    final l = AppLocalizations.of(context)!;
    final post = _post;
    if (post == null && _loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (post == null && _error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.error_outline,
                  size: 64, color: Theme.of(context).colorScheme.error),
              const SizedBox(height: 16),
              Text(_error!, textAlign: TextAlign.center),
              const SizedBox(height: 16),
              FilledButton.tonal(onPressed: _load, child: Text(l.commonRetry)),
            ],
          ),
        ),
      );
    }
    if (post == null) return const SizedBox.shrink();
    return ListView(
      padding: EdgeInsets.zero,
      children: [
        _MediaCarousel(
          media: post.media,
          controller: _pageController,
          onPageChanged: (i) => setState(() => _mediaIndex = i),
          currentIndex: _mediaIndex,
          isHotDeal: post.isHotDeal,
          discountPercent: post.discountPercent,
        ),
        _FactoryHeader(
          name: post.factoryName,
          trustScore: post.trustScore,
          avgRating: post.factoryAvgRating,
          reviewsCount: post.factoryReviewsCount,
          factoryUserId: post.factoryUserId,
          isFollowing: _isFollowing,
          followInFlight: _followInFlight,
          isOwnPost: post.factoryUserId == _myUserId,
          onFollowTap: _onFollowTap,
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
          child: Text(
            // BUG-008: показываем переведённый title если перевод активен
            _translatedTitle ?? post.title,
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: _ActionsRow(
            isLiked: post.isLikedByMe,
            isSaved: post.isSavedByMe,
            likesCount: post.likesCount,
            commentsCount: post.commentsCount,
            sharesCount: post.sharesCount,
            viewsCount: post.viewsCount,
            likeInFlight: _likeInFlight,
            saveInFlight: _saveInFlight,
            onLikeTap: _onLikeTap,
            onCommentTap: _openComments,
            onShareTap: _onShareTap,
            onSaveTap: _onSaveTap,
          ),
        ),
        // BUG-010: не показываем описание если оно дублирует title или пустое
        if (post.description != null &&
            post.description!.isNotEmpty &&
            post.description!.trim() != post.title.trim()) ...[
          const Divider(height: 32),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Заголовок отдельной строкой — без Row/Spacer/spaceBetween,
                // которые требуют tight width parent. Кнопка «Перевести»
                // вынесена ПОД описание как отдельный element — это
                // bulletproof layout без shared-width проблем.
                Text(
                  l.postDescription,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const SizedBox(height: 8),
                Text(
                  _translatedDescription ?? post.description!,
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                const SizedBox(height: 4),
                // Простой Align для выравнивания кнопки слева — не Row,
                // не требует tight width parent.
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    onPressed: _translatingDescription
                        ? null
                        : _translateDescription,
                    icon: _translatingDescription
                        ? const SizedBox(
                            width: 14,
                            height: 14,
                            child:
                                CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.translate, size: 18),
                    label: Text(
                      _translatedDescription != null
                          ? l.postShowOriginal
                          : l.postTranslate,
                    ),
                    style: TextButton.styleFrom(
                      visualDensity: VisualDensity.compact,
                      padding: EdgeInsets.zero,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
        // Group Buy блок — только для постов type='group_buy'
        if (post.groupBuy != null) ...[
          const Divider(height: 32),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: _GroupBuySection(
              post: post,
              onJoinPressed: _openGroupBuySheet,
              onLeavePressed: _onLeaveGroupBuy,
            ),
          ),
        ],
        const Divider(height: 32),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: _PriceSection(post: post),
        ),
        const Divider(height: 32),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: _SpecsRow(post: post),
        ),
        if (post.hashtags.isNotEmpty) ...[
          const Divider(height: 32),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Wrap(
              spacing: 6,
              runSpacing: 6,
              children: post.hashtags
                  .map((tag) => ActionChip(
                        label: Text('#$tag'),
                        visualDensity: VisualDensity.compact,
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
          ),
        ],
        const SizedBox(height: 24),
      ],
    );
  }

  Widget _buildBottomBar(FeedPost post) {
    final l = AppLocalizations.of(context)!;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(l.postPriceLabel,
                      style: Theme.of(context).textTheme.bodySmall),
                  Text(
                    '${post.priceAmount} ${post.priceCurrency}',
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                  ),
                  ConvertedPriceText(
                    amount: post.priceAmount,
                    fromCurrency: post.priceCurrency,
                    prefix: '',
                  ),
                ],
              ),
            ),
            FilledButton.icon(
              onPressed: _openChatWithFactory,
              icon: const Icon(Icons.chat_bubble_outline),
              label: Text(l.postWriteToFactory),
              style: FilledButton.styleFrom(
                minimumSize: const Size(0, 48),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MediaCarousel extends StatelessWidget {
  const _MediaCarousel({
    required this.media,
    required this.controller,
    required this.onPageChanged,
    required this.currentIndex,
    required this.isHotDeal,
    required this.discountPercent,
  });

  final List<Map<String, dynamic>> media;
  final PageController controller;
  final ValueChanged<int> onPageChanged;
  final int currentIndex;
  final bool isHotDeal;
  final int discountPercent;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Stack(
      children: [
        AspectRatio(
          aspectRatio: 1,
          child: media.isEmpty
              ? Container(
                  color: scheme.surfaceContainerHighest,
                  child: Icon(Icons.image,
                      size: 96, color: scheme.onSurfaceVariant),
                )
              : PageView.builder(
                  controller: controller,
                  onPageChanged: onPageChanged,
                  itemCount: media.length,
                  itemBuilder: (_, i) {
                    // Defensive: бэк теоретически может прислать `url`/`type`
                    // не строкой — `is String` вместо `as String?` чтобы не
                    // словить TypeError в build при невалидном payload.
                    final rawUrl = media[i]['url'];
                    final rawType = media[i]['type'];
                    final url = rawUrl is String ? rawUrl : null;
                    final type = rawType is String ? rawType : null;
                    if (url == null) {
                      return Container(color: scheme.surfaceContainerHighest);
                    }
                    if (type == 'video') {
                      return VideoMediaPlayer(
                        mediaUrl: url,
                        // На детальном экране включаем autoplay для удобства,
                        // но звук по умолчанию выключен (TikTok-стиль)
                        autoplay: true,
                        muted: true,
                        fit: BoxFit.contain,
                      );
                    }
                    return GestureDetector(
                      onTap: () {
                        // UX-1: tap на фото → fullscreen viewer со swipe+zoom
                        final photoUrls = media
                            .where((m) => m['type'] != 'video')
                            .map((m) => m['url'] as String? ?? '')
                            .where((u) => u.isNotEmpty)
                            .toList();
                        final tappedIndex = photoUrls.indexOf(url);
                        PhotoViewer.show(
                          context,
                          photoUrls: photoUrls,
                          initialIndex: tappedIndex >= 0 ? tappedIndex : 0,
                        );
                      },
                      child: CachedNetworkImage(
                        imageUrl: ApiClient.resolveMediaUrl(url),
                        fit: BoxFit.cover,
                        placeholder: (_, __) => Container(
                          color: scheme.surfaceContainerHighest,
                          child: const Center(
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                        ),
                        errorWidget: (_, __, ___) => Container(
                          color: scheme.surfaceContainerHighest,
                          child: Icon(Icons.broken_image,
                              color: scheme.onSurfaceVariant),
                        ),
                      ),
                    );
                  },
                ),
        ),
        if (media.length > 1)
          Positioned(
            bottom: 12,
            left: 0,
            right: 0,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(media.length, (i) {
                final selected = i == currentIndex;
                return AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  margin: const EdgeInsets.symmetric(horizontal: 3),
                  width: selected ? 10 : 6,
                  height: 6,
                  decoration: BoxDecoration(
                    color: selected
                        ? Colors.white
                        : Colors.white.withValues(alpha: 0.5),
                    borderRadius: BorderRadius.circular(3),
                  ),
                );
              }),
            ),
          ),
        if (isHotDeal && discountPercent > 0)
          Positioned(
            top: 12,
            left: 12,
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.red,
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                '🔥 -$discountPercent%',
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _FactoryHeader extends StatelessWidget {
  const _FactoryHeader({
    required this.name,
    required this.trustScore,
    required this.avgRating,
    required this.reviewsCount,
    required this.factoryUserId,
    required this.isFollowing,
    required this.followInFlight,
    required this.isOwnPost,
    required this.onFollowTap,
  });
  final String name;
  final int trustScore;
  final double avgRating;
  final int reviewsCount;
  final String? factoryUserId;
  final bool? isFollowing;
  final bool followInFlight;
  final bool isOwnPost;
  final VoidCallback onFollowTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      child: Row(
        children: [
          FactoryAvatar(name: name, size: 42),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      letterSpacing: -0.2,
                    ),
                    overflow: TextOverflow.ellipsis),
                const SizedBox(height: 3),
                Row(
                  children: [
                    // Живой статус вместо «Trust Score: 0».
                    TrustBadge(score: trustScore),
                    if (reviewsCount > 0 && factoryUserId != null) ...[
                      const SizedBox(width: 8),
                      InkWell(
                        onTap: () {
                          Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => ReviewsListScreen(
                                factoryId: factoryUserId!,
                                factoryName: name,
                                canWriteReview: !isOwnPost,
                              ),
                            ),
                          );
                        },
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.star,
                                size: 14, color: Colors.amber),
                            const SizedBox(width: 2),
                            Text(
                              '${avgRating.toStringAsFixed(1)} ($reviewsCount)',
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
          // Follow-кнопка — скрыта для своего поста. Пока isFollowing null
          // (загружается), показываем placeholder.
          if (!isOwnPost)
            Padding(
              padding: const EdgeInsets.only(left: 8),
              child: isFollowing == null
                  ? const SizedBox(
                      width: 80,
                      height: 32,
                      child: Center(
                        child: SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                      ),
                    )
                  : FilledButton.tonal(
                      onPressed: followInFlight ? null : onFollowTap,
                      style: FilledButton.styleFrom(
                        visualDensity: VisualDensity.compact,
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 0),
                        minimumSize: const Size(0, 32),
                        backgroundColor: isFollowing!
                            ? scheme.surfaceContainerHighest
                            : scheme.primary,
                        foregroundColor: isFollowing!
                            ? scheme.onSurface
                            : scheme.onPrimary,
                      ),
                      child: followInFlight
                          ? const SizedBox(
                              width: 14,
                              height: 14,
                              child:
                                  CircularProgressIndicator(strokeWidth: 2),
                            )
                          : Text(isFollowing!
                              ? AppLocalizations.of(context)!.postUnfollow
                              : AppLocalizations.of(context)!.postFollow),
                    ),
            ),
        ],
      ),
    );
  }
}

class _ActionsRow extends StatelessWidget {
  const _ActionsRow({
    required this.isLiked,
    required this.isSaved,
    required this.likesCount,
    required this.commentsCount,
    required this.sharesCount,
    required this.viewsCount,
    required this.likeInFlight,
    required this.saveInFlight,
    required this.onLikeTap,
    required this.onCommentTap,
    required this.onShareTap,
    required this.onSaveTap,
  });

  final bool isLiked;
  final bool isSaved;
  final int likesCount;
  final int commentsCount;
  final int sharesCount;
  final int viewsCount;
  final bool likeInFlight;
  final bool saveInFlight;
  final VoidCallback onLikeTap;
  final VoidCallback onCommentTap;
  final VoidCallback onShareTap;
  final VoidCallback onSaveTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Row(
      children: [
        IconButton(
          icon: Icon(
            isLiked ? Icons.favorite : Icons.favorite_border,
            color: isLiked ? Colors.red : null,
          ),
          onPressed: likeInFlight ? null : onLikeTap,
        ),
        Text('$likesCount', style: Theme.of(context).textTheme.bodyMedium),
        const SizedBox(width: 16),
        IconButton(
          icon: const Icon(Icons.mode_comment_outlined),
          onPressed: onCommentTap,
        ),
        Text('$commentsCount', style: Theme.of(context).textTheme.bodyMedium),
        const SizedBox(width: 16),
        IconButton(
          icon: const Icon(Icons.send_outlined),
          onPressed: onShareTap,
        ),
        Text('$sharesCount', style: Theme.of(context).textTheme.bodyMedium),
        const Spacer(),
        Icon(Icons.visibility_outlined,
            size: 18, color: scheme.onSurfaceVariant),
        const SizedBox(width: 4),
        Text('$viewsCount',
            style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(width: 8),
        IconButton(
          icon: Icon(
            isSaved ? Icons.bookmark : Icons.bookmark_border,
          ),
          tooltip: isSaved
              ? AppLocalizations.of(context)!.postDetailSavedTooltip
              : AppLocalizations.of(context)!.postDetailSaveTooltip,
          onPressed: saveInFlight ? null : onSaveTap,
        ),
      ],
    );
  }
}

class _PriceSection extends StatelessWidget {
  const _PriceSection({required this.post});
  final FeedPost post;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final l = AppLocalizations.of(context)!;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(l.postPriceLabel,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                )),
        const SizedBox(height: 8),
        Text(
          '${post.priceAmount} ${post.priceCurrency}',
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w700,
              ),
        ),
        ConvertedPriceText(
          amount: post.priceAmount,
          fromCurrency: post.priceCurrency,
          prefix: '',
          style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                color: scheme.onSurfaceVariant,
              ),
        ),
        if (post.priceTiers.isNotEmpty) ...[
          const SizedBox(height: 16),
          Text(l.postPriceTiers,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: scheme.onSurfaceVariant,
                  )),
          const SizedBox(height: 8),
          Container(
            decoration: BoxDecoration(
              border: Border.all(color: scheme.outlineVariant),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Column(
              children: [
                for (var i = 0; i < post.priceTiers.length; i++) ...[
                  if (i > 0) Divider(height: 1, color: scheme.outlineVariant),
                  Padding(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 12),
                    child: Row(
                      children: [
                        Icon(Icons.inventory_2_outlined,
                            size: 16, color: scheme.onSurfaceVariant),
                        const SizedBox(width: 8),
                        Text(l.postPriceTierFromQty(post.priceTiers[i].quantity),
                            style:
                                Theme.of(context).textTheme.bodyMedium),
                        const Spacer(),
                        Text(
                          '${post.priceTiers[i].price} ${post.priceCurrency}',
                          style:
                              Theme.of(context).textTheme.bodyMedium?.copyWith(
                                    fontWeight: FontWeight.w700,
                                  ),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _SpecsRow extends StatelessWidget {
  const _SpecsRow({required this.post});
  final FeedPost post;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final stockLabel = switch (post.stockStatus) {
      'in_stock' => l.postSpecsStockInStock,
      'pre_order' => l.postSpecsStockOnDemand,
      'out_of_stock' => l.postSpecsStockOutOfStock,
      _ => post.stockStatus,
    };
    return Row(
      children: [
        Expanded(
          child: _SpecItem(
            icon: Icons.inventory_2_outlined,
            label: 'MOQ',
            value: '${post.moq}',
          ),
        ),
        Expanded(
          child: _SpecItem(
            icon: Icons.local_shipping_outlined,
            label: l.createPostShippingDays,
            value: '${post.shippingDays}',
          ),
        ),
        Expanded(
          child: _SpecItem(
            icon: Icons.check_circle_outline,
            label: l.createPostStockStatus,
            value: stockLabel,
          ),
        ),
      ],
    );
  }
}

class _SpecItem extends StatelessWidget {
  const _SpecItem({required this.icon, required this.label, required this.value});
  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      children: [
        Icon(icon, size: 20, color: scheme.onSurfaceVariant),
        const SizedBox(height: 4),
        Text(label,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: scheme.onSurfaceVariant,
                )),
        const SizedBox(height: 2),
        Text(value,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                )),
      ],
    );
  }
}

/// Секция group buy с progress bar, счётчиками и кнопкой действия.
class _GroupBuySection extends StatelessWidget {
  const _GroupBuySection({
    required this.post,
    required this.onJoinPressed,
    required this.onLeavePressed,
  });
  final FeedPost post;
  final VoidCallback onJoinPressed;
  final VoidCallback onLeavePressed;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final l = AppLocalizations.of(context)!;
    final gb = post.groupBuy!;
    final isParticipating = gb.myOrderQuantity > 0;
    final remaining = gb.targetQuantity - gb.currentQuantity;

    // Цветовая схема в зависимости от состояния
    late final Color accentColor;
    late final IconData statusIcon;
    late final String statusText;
    if (gb.isGoalReached) {
      accentColor = Colors.green;
      statusIcon = Icons.check_circle;
      statusText = l.groupBuyGoalReached;
    } else if (gb.isPastDeadline) {
      accentColor = Colors.grey;
      statusIcon = Icons.timer_off;
      statusText = l.groupBuyExpired;
    } else {
      accentColor = scheme.primary;
      statusIcon = Icons.groups;
      statusText = l.groupBuyStatusCollecting;
    }

    return Container(
      width: double.infinity, // явная tight width, чтобы Row'ы с Expanded внутри работали корректно
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            accentColor.withValues(alpha: 0.12),
            accentColor.withValues(alpha: 0.04),
          ],
        ),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: accentColor.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(statusIcon, color: accentColor, size: 22),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  statusText,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: accentColor,
                      ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          // Цена-хинт
          if (gb.unitPrice != null)
            Text(
              l.groupBuyDealText(
                gb.targetQuantity,
                gb.unitPrice!,
                post.priceCurrency,
              ),
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: scheme.onSurfaceVariant,
                  ),
            ),
          const SizedBox(height: 12),
          // Progress bar
          Row(
            children: [
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(6),
                  child: LinearProgressIndicator(
                    value: gb.progress,
                    minHeight: 10,
                    backgroundColor: scheme.surfaceContainerHighest,
                    valueColor:
                        AlwaysStoppedAnimation<Color>(accentColor),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Text(
                '${(gb.progress * 100).toStringAsFixed(0)}%',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                      color: accentColor,
                    ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _StatBadge(
                icon: Icons.inventory_2_outlined,
                label: l.groupBuyCollected,
                value: '${gb.currentQuantity} / ${gb.targetQuantity}',
              ),
              _StatBadge(
                icon: Icons.people_outline,
                label: l.groupBuyParticipantsLabel,
                value: '${gb.participantCount}',
              ),
              if (gb.deadline != null)
                _StatBadge(
                  icon: Icons.schedule,
                  label: l.groupBuyRemaining,
                  value: _formatRemaining(context, gb.deadline!),
                ),
            ],
          ),
          const SizedBox(height: 12),
          if (isParticipating) ...[
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: scheme.surface,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: accentColor.withValues(alpha: 0.3)),
              ),
              child: Row(
                children: [
                  Icon(Icons.check_circle_outline, color: accentColor),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      l.groupBuyParticipating(gb.myOrderQuantity),
                      style: Theme.of(context)
                          .textTheme
                          .bodyMedium
                          ?.copyWith(fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: gb.isActive ? onJoinPressed : null,
                    icon: const Icon(Icons.edit_outlined, size: 18),
                    label: Text(l.groupBuyEditMyOrder),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: onLeavePressed,
                    icon: const Icon(Icons.close, size: 18),
                    label: Text(l.groupBuyLeaveShort),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.red,
                    ),
                  ),
                ),
              ],
            ),
          ] else if (gb.isActive) ...[
            FilledButton.icon(
              onPressed: onJoinPressed,
              icon: const Icon(Icons.add_shopping_cart),
              label: Text(l.groupBuyJoinWithRemaining(remaining)),
              style: FilledButton.styleFrom(
                minimumSize: const Size.fromHeight(48),
                backgroundColor: accentColor,
              ),
            ),
          ],
        ],
      ),
    );
  }

  /// Форматируем «сколько осталось до deadline» в компактный вид.
  static String _formatRemaining(BuildContext context, DateTime deadline) {
    final l = AppLocalizations.of(context)!;
    final diff = deadline.difference(DateTime.now());
    if (diff.isNegative) return l.commonExpired;
    if (diff.inDays >= 1) return l.commonDaysShort(diff.inDays);
    if (diff.inHours >= 1) return l.commonHoursShort(diff.inHours);
    if (diff.inMinutes >= 1) return l.commonMinutesShort(diff.inMinutes);
    return l.commonLessThanMinute;
  }
}

/// Маленький бейдж с иконкой, лейблом и значением для статистики group buy.
class _StatBadge extends StatelessWidget {
  const _StatBadge({
    required this.icon,
    required this.label,
    required this.value,
  });
  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      children: [
        Icon(icon, size: 18, color: scheme.onSurfaceVariant),
        const SizedBox(height: 2),
        Text(
          label,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: scheme.onSurfaceVariant,
              ),
        ),
        Text(
          value,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w700,
              ),
        ),
      ],
    );
  }
}

/// Bottom sheet для ввода количества при join group buy.
class _GroupBuyJoinSheet extends StatefulWidget {
  const _GroupBuyJoinSheet({
    required this.initialQuantity,
    required this.unitPrice,
    required this.currency,
  });
  final int initialQuantity;
  final String? unitPrice;
  final String currency;

  @override
  State<_GroupBuyJoinSheet> createState() => _GroupBuyJoinSheetState();
}

class _GroupBuyJoinSheetState extends State<_GroupBuyJoinSheet> {
  late final TextEditingController _controller;
  int _quantity = 100;

  @override
  void initState() {
    super.initState();
    _quantity = widget.initialQuantity;
    _controller = TextEditingController(text: '$_quantity');
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _adjust(int delta) {
    final next = (_quantity + delta).clamp(1, 1000000);
    setState(() {
      _quantity = next;
      _controller.text = '$next';
    });
  }

  double? get _estimatedTotal {
    if (widget.unitPrice == null) return null;
    final unit = double.tryParse(widget.unitPrice!);
    if (unit == null) return null;
    return unit * _quantity;
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 8,
        bottom: 20 + MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            l.groupBuyJoinSheetTitleLong,
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 4),
          Text(
            l.groupBuyJoinSheetSubtitle,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
          ),
          const SizedBox(height: 20),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              IconButton.filledTonal(
                onPressed: () => _adjust(-10),
                icon: const Icon(Icons.remove),
              ),
              const SizedBox(width: 12),
              SizedBox(
                width: 120,
                child: TextField(
                  controller: _controller,
                  keyboardType: TextInputType.number,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.headlineMedium,
                  decoration: const InputDecoration(
                    border: OutlineInputBorder(),
                    isDense: true,
                    contentPadding:
                        EdgeInsets.symmetric(vertical: 8, horizontal: 4),
                  ),
                  onChanged: (v) {
                    final n = int.tryParse(v.trim());
                    if (n != null && n >= 1) {
                      setState(() => _quantity = n);
                    }
                  },
                ),
              ),
              const SizedBox(width: 12),
              IconButton.filledTonal(
                onPressed: () => _adjust(10),
                icon: const Icon(Icons.add),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              OutlinedButton(
                onPressed: () => _adjust(50),
                child: const Text('+50'),
              ),
              const SizedBox(width: 8),
              OutlinedButton(
                onPressed: () => _adjust(100),
                child: const Text('+100'),
              ),
              const SizedBox(width: 8),
              OutlinedButton(
                onPressed: () => _adjust(500),
                child: const Text('+500'),
              ),
            ],
          ),
          if (_estimatedTotal != null) ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    l.groupBuyJoinSheetEstimated,
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                  Text(
                    '${_estimatedTotal!.toStringAsFixed(2)} ${widget.currency}',
                    style:
                        Theme.of(context).textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 20),
          FilledButton(
            onPressed: _quantity >= 1
                ? () => Navigator.of(context).pop(_quantity)
                : null,
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(48),
            ),
            child: Text(l.groupBuyJoinSheetConfirm),
          ),
          const SizedBox(height: 8),
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text(l.commonCancel),
          ),
        ],
      ),
    );
  }
}
