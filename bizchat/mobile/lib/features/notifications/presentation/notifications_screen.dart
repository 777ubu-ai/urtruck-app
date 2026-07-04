import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../../core/api/api_client.dart';
import '../../../core/widgets/loading_skeleton.dart';
import '../../../l10n/app_localizations.dart';
import '../../chat/presentation/conversation_screen.dart';
import '../../feed/presentation/post_detail_screen.dart';
import '../data/notifications_repository.dart';

/// Экран уведомлений. Открывается из колокольчика в AppBar главных вкладок.
///
/// Поведение тапа на уведомление:
///   - like/comment → открывает деталь поста
///   - message → открывает беседу
class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  final _repo = NotificationsRepository();
  final _scrollController = ScrollController();

  final List<AppNotification> _items = [];
  String? _nextCursor;
  bool _hasMore = true;
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadMore();
    _scrollController.addListener(() {
      if (_scrollController.position.pixels >=
          _scrollController.position.maxScrollExtent - 200) {
        if (!_loading && _hasMore) _loadMore();
      }
    });
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _loadMore() async {
    if (_loading) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final page = await _repo.loadPage(cursor: _nextCursor);
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

  Future<void> _refresh() async {
    setState(() {
      _items.clear();
      _nextCursor = null;
      _hasMore = true;
      _error = null;
    });
    await _loadMore();
  }

  Future<void> _markAllRead() async {
    await _repo.markAllAsRead();
    if (!mounted) return;
    setState(() {
      for (var i = 0; i < _items.length; i++) {
        if (_items[i].readAt == null) {
          _items[i] = AppNotification(
            id: _items[i].id,
            type: _items[i].type,
            actorId: _items[i].actorId,
            actorName: _items[i].actorName,
            post: _items[i].post,
            conversationId: _items[i].conversationId,
            preview: _items[i].preview,
            readAt: DateTime.now(),
            createdAt: _items[i].createdAt,
          );
        }
      }
    });
  }

  Future<void> _onTapNotification(AppNotification n) async {
    // Помечаем как прочитанное (fire-and-forget)
    if (!n.isRead) {
      _repo.markAsRead(n.id);
      setState(() {
        final idx = _items.indexWhere((x) => x.id == n.id);
        if (idx >= 0) {
          _items[idx] = AppNotification(
            id: n.id,
            type: n.type,
            actorId: n.actorId,
            actorName: n.actorName,
            post: n.post,
            conversationId: n.conversationId,
            preview: n.preview,
            readAt: DateTime.now(),
            createdAt: n.createdAt,
          );
        }
      });
    }
    // Навигация
    if (n.type == NotifType.like ||
        n.type == NotifType.comment ||
        n.type == NotifType.groupBuyCompleted) {
      if (n.post != null) {
        await Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => PostDetailScreen(postId: n.post!.id),
          ),
        );
      }
    } else if (n.type == NotifType.message) {
      if (n.conversationId != null) {
        // Открываем беседу. Имя собеседника берём из actorName уведомления.
        await Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => ConversationScreen(
              conversationId: n.conversationId!,
              partnerName: n.actorName,
            ),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(
        title: Text(l.notificationsTitle),
        actions: [
          if (_items.any((n) => !n.isRead))
            TextButton(
              onPressed: _markAllRead,
              child: Text(l.notificationsMarkAllRead),
            ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: _buildBody(),
      ),
    );
  }

  Widget _buildBody() {
    if (_items.isEmpty && _loading) {
      // Skeleton-список вместо спиннера — даёт ощущение мгновенного отклика.
      return ListView.separated(
        itemCount: 8,
        separatorBuilder: (_, __) => const Divider(height: 1, indent: 76),
        itemBuilder: (_, __) => const Padding(
          padding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: CompactPostTileSkeleton(),
        ),
      );
    }
    if (_items.isEmpty && _error != null) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          const SizedBox(height: 120),
          Icon(Icons.error_outline,
              size: 64, color: Theme.of(context).colorScheme.error),
          const SizedBox(height: 12),
          Center(child: Text(_error!)),
        ],
      );
    }
    if (_items.isEmpty) {
      return const _EmptyNotifications();
    }
    return ListView.separated(
      controller: _scrollController,
      itemCount: _items.length + (_hasMore ? 1 : 0),
      separatorBuilder: (_, __) => const Divider(height: 1, indent: 76),
      itemBuilder: (_, i) {
        if (i >= _items.length) {
          return const Padding(
            padding: EdgeInsets.all(16),
            child: Center(child: CircularProgressIndicator()),
          );
        }
        return _NotificationTile(
          notif: _items[i],
          onTap: () => _onTapNotification(_items[i]),
        );
      },
    );
  }
}

class _NotificationTile extends StatelessWidget {
  const _NotificationTile({required this.notif, required this.onTap});
  final AppNotification notif;
  final VoidCallback onTap;

  IconData get _typeIcon {
    switch (notif.type) {
      case NotifType.like:
        return Icons.favorite;
      case NotifType.comment:
        return Icons.mode_comment;
      case NotifType.message:
        return Icons.chat_bubble;
      case NotifType.review:
        return Icons.star;
      case NotifType.groupBuyCompleted:
        return Icons.celebration;
      case NotifType.unknown:
        return Icons.notifications;
    }
  }

  Color _typeColor(BuildContext context) {
    switch (notif.type) {
      case NotifType.like:
        return Colors.red;
      case NotifType.comment:
        return Colors.blue;
      case NotifType.message:
        return Colors.green;
      case NotifType.review:
        return Colors.amber;
      case NotifType.groupBuyCompleted:
        return Colors.deepPurple;
      case NotifType.unknown:
        return Theme.of(context).colorScheme.onSurfaceVariant;
    }
  }

  String _buildText(AppLocalizations l) {
    switch (notif.type) {
      case NotifType.like:
        return l.notifActorLiked(notif.actorName, _postRef(l));
      case NotifType.comment:
        return l.notifActorCommented(notif.actorName, _postRef(l));
      case NotifType.message:
        return l.notifActorMessage(notif.actorName);
      case NotifType.review:
        return l.notifActorReview(notif.actorName);
      case NotifType.groupBuyCompleted:
        return l.notifGroupBuyCompletedWithRef(_postRef(l));
      case NotifType.unknown:
        return notif.actorName;
    }
  }

  String _postRef(AppLocalizations l) {
    if (notif.post?.title != null) {
      final title = notif.post!.title!;
      final trimmed =
          title.length > 40 ? '${title.substring(0, 40)}…' : title;
      return l.notifPostRef(trimmed);
    }
    return l.notifYourPostRef;
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final l = AppLocalizations.of(context)!;
    final thumb = notif.post?.thumbnailUrl;
    return ListTile(
      onTap: onTap,
      tileColor:
          notif.isRead ? null : scheme.primaryContainer.withValues(alpha: 0.15),
      leading: Stack(
        children: [
          CircleAvatar(
            radius: 22,
            backgroundColor: scheme.surfaceContainerHighest,
            child: Text(
              notif.actorName.isNotEmpty
                  ? notif.actorName[0].toUpperCase()
                  : '?',
              style: TextStyle(
                fontWeight: FontWeight.w700,
                color: scheme.onSurface,
              ),
            ),
          ),
          Positioned(
            right: 0,
            bottom: 0,
            child: Container(
              decoration: BoxDecoration(
                color: scheme.surface,
                shape: BoxShape.circle,
                border: Border.all(color: scheme.surface, width: 2),
              ),
              child: Icon(_typeIcon, size: 14, color: _typeColor(context)),
            ),
          ),
        ],
      ),
      title: Text(
        _buildText(l),
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          fontWeight: notif.isRead ? FontWeight.normal : FontWeight.w600,
        ),
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (notif.preview != null)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(
                notif.preview!,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: scheme.onSurfaceVariant,
                    ),
              ),
            ),
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(
              _timeAgo(notif.createdAt, l),
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: scheme.onSurfaceVariant,
                  ),
            ),
          ),
        ],
      ),
      trailing: thumb != null
          ? ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: SizedBox(
                width: 48,
                height: 48,
                child: CachedNetworkImage(
                  imageUrl: ApiClient.resolveMediaUrl(thumb),
                  fit: BoxFit.cover,
                  placeholder: (_, __) =>
                      Container(color: scheme.surfaceContainerHighest),
                  errorWidget: (_, __, ___) => Container(
                    color: scheme.surfaceContainerHighest,
                    child: Icon(Icons.broken_image,
                        color: scheme.onSurfaceVariant, size: 16),
                  ),
                ),
              ),
            )
          : null,
    );
  }

  static String _timeAgo(DateTime dt, AppLocalizations l) {
    final diff = DateTime.now().difference(dt);
    if (diff.inSeconds < 60) return l.notifTimeJustNow;
    if (diff.inMinutes < 60) return l.notifTimeMinutesAgo(diff.inMinutes);
    if (diff.inHours < 24) return l.notifTimeHoursAgo(diff.inHours);
    if (diff.inDays < 7) return l.notifTimeDaysAgo(diff.inDays);
    return '${dt.day.toString().padLeft(2, '0')}.'
        '${dt.month.toString().padLeft(2, '0')}.'
        '${dt.year}';
  }
}

class _EmptyNotifications extends StatelessWidget {
  const _EmptyNotifications();
  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final l = AppLocalizations.of(context)!;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        const SizedBox(height: 120),
        Icon(Icons.notifications_none,
            size: 96, color: scheme.onSurfaceVariant),
        const SizedBox(height: 16),
        Text(
          l.notificationsEmpty,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.titleLarge,
        ),
      ],
    );
  }
}
